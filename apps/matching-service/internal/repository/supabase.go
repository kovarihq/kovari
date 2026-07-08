
package repository

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"golang.org/x/sync/errgroup"
	"github.com/kovari/matching-service/internal/models"
)

type profileCacheEntry struct {
	profile   *models.StaticAttributes
	expiresAt time.Time
}

type SupabaseRepository struct {
	url          string
	anonKey      string
	geoapifyKey  string
	client       *http.Client
	redis        *RedisRepository
	geoInFlight  sync.Map
	profileCache sync.Map
}

func NewSupabaseRepository(url, anonKey, geoKey string, redis *RedisRepository) (*SupabaseRepository, error) {
	if url == "" || anonKey == "" {
		return nil, fmt.Errorf("Supabase URL and Anon Key are required")
	}
	url = strings.TrimSuffix(url, "/")
	r := &SupabaseRepository{
		url:         url,
		anonKey:     anonKey,
		geoapifyKey: geoKey,
		redis:       redis,
		client: &http.Client{
			Timeout: 10 * time.Second,
			Transport: &http.Transport{
				MaxIdleConns:        100,
				MaxIdleConnsPerHost: 100,
				IdleConnTimeout:     90 * time.Second,
				TLSHandshakeTimeout: 5 * time.Second,
			},
		},
	}

	// Active eviction background cleanup to prevent memory leaks from stale cached profiles
	go func() {
		ticker := time.NewTicker(5 * time.Minute)
		for range ticker.C {
			now := time.Now()
			r.profileCache.Range(func(key, value interface{}) bool {
				entry, ok := value.(profileCacheEntry)
				if ok && now.After(entry.expiresAt) {
					r.profileCache.Delete(key)
				}
				return true
			})
		}
	}()

	return r, nil
}

func (r *SupabaseRepository) GeocodeGeoapify(ctx context.Context, raw string) (float64, float64, bool) {
	if raw == "" || r.geoapifyKey == "" {
		return 0, 0, false
	}

	// Normalize: Extract city, lowercase and trim for better cache hits
	cityPart := strings.Split(raw, ",")[0]
	city := strings.ToLower(strings.TrimSpace(cityPart))
	if city == "" {
		return 0, 0, false
	}

	cacheKey := fmt.Sprintf("geo:%s", city)

	// Step 1: Check Static fallback (fast, pure compute)
	fallback := map[string][]float64{
		"mumbai": {19.0760, 72.8777},
		"surat":  {21.1702, 72.8311},
	}
	if coords, ok := fallback[city]; ok {
		log.Printf("GEO STATIC FALLBACK: %s", city)
		return coords[0], coords[1], true
	}

	// Step 2: Non-blocking Background resolution (Redis + API)
	if _, loaded := r.geoInFlight.LoadOrStore(cacheKey, true); loaded {
		log.Printf("GEO RESOLUTION IN-FLIGHT: %s (Skipping trigger)", cacheKey)
		return 0, 0, false
	}

	go func() {
		defer r.geoInFlight.Delete(cacheKey)

		bgCtx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		defer cancel()

		log.Printf("BACKGROUND GEO START: %s (Checking Redis first)", cacheKey)

		// 2.1 Check Redis Cache (now in background)
		if r.redis != nil {
			if val, err := r.redis.GetCache(bgCtx, cacheKey); err == nil {
				var coords []float64
				if err := json.Unmarshal([]byte(val), &coords); err == nil && len(coords) == 2 {
					log.Printf("BACKGROUND GEO CACHE HIT: %s -> %v", cacheKey, coords)
					return
				}
			}
		}

		// 2.2 Live API call (if Redis miss)
		log.Printf("BACKGROUND GEO API CALL: %s", cacheKey)
		apiURL := fmt.Sprintf("https://api.geoapify.com/v1/geocode/autocomplete?text=%s&type=city&limit=1&lang=en&apiKey=%s",
			strings.ReplaceAll(city, " ", "%20"), r.geoapifyKey)

		req, _ := http.NewRequestWithContext(bgCtx, "GET", apiURL, nil)
		resp, err := r.client.Do(req)
		if err != nil || resp.StatusCode != http.StatusOK {
			log.Printf("BACKGROUND GEO FAILED: %s (Error: %v)", cacheKey, err)
			return
		}
		defer resp.Body.Close()

		var result struct {
			Features []struct {
				Properties struct {
					Lat float64 `json:"lat"`
					Lon float64 `json:"lon"`
				} `json:"properties"`
			} `json:"features"`
		}

		if err := json.NewDecoder(resp.Body).Decode(&result); err != nil || len(result.Features) == 0 {
			log.Printf("BACKGROUND GEO FAILED: %s (No results)", cacheKey)
			return
		}

		lat, lon := result.Features[0].Properties.Lat, result.Features[0].Properties.Lon

		// 2.3 Store in Redis for future requests
		if r.redis != nil {
			coordsJson, _ := json.Marshal([]float64{lat, lon})
			r.redis.SetCache(context.Background(), cacheKey, string(coordsJson), 30*24*time.Hour)
		}
		log.Printf("BACKGROUND GEO RESOLVED & CACHED: %s -> %v,%v", cacheKey, lat, lon)
	}()

	return 0, 0, false
}

func parseCoord(v interface{}) float64 {
	if v == nil {
		return 0
	}
	switch val := v.(type) {
	case float64:
		return val
	case float32:
		return float64(val)
	case int:
		return float64(val)
	case int64:
		return float64(val)
	case string:
		// Handle string coordinates (common in some DB exports)
		f, err := strconv.ParseFloat(strings.TrimSpace(val), 64)
		if err != nil {
			return 0
		}
		return f
	default:
		return 0
	}
}

type profileResponse struct {
	UserID         string      `json:"user_id"`
	Name           *string     `json:"name"`
	Age            *int        `json:"age"`
	Gender         *string     `json:"gender"`
	Personality    *string     `json:"personality"`
	Location       interface{} `json:"location"`
	Smoking        *string     `json:"smoking"`
	Drinking       *string     `json:"drinking"`
	Religion       *string     `json:"religion"`
	Interests      []string    `json:"interests"`
	Languages      []string    `json:"languages"`
	Nationality    *string     `json:"nationality"`
	Profession     *string     `json:"job"`
	Avatar         *string     `json:"profile_photo"`
	Bio            *string     `json:"bio"`
	FoodPreference *string     `json:"food_preference"`
	TravelIntentions interface{} `json:"travel_intentions"`
	Latitude       *float64    `json:"latitude"`
	Longitude      *float64    `json:"longitude"`
}

func (r *SupabaseRepository) FetchProfilesBatch(ctx context.Context, requesterId string, clerkUserIds []string, preResolved map[string]models.Coordinates) (map[string]*models.StaticAttributes, error) {
	if len(clerkUserIds) == 0 {
		return make(map[string]*models.StaticAttributes), nil
	}

	results := make(map[string]*models.StaticAttributes)
	var uncachedIds []string

	now := time.Now()
	for _, id := range clerkUserIds {
		// Bypass cache read for active requester to guarantee profile freshness
		if requesterId != "" && id == requesterId {
			uncachedIds = append(uncachedIds, id)
			continue
		}

		// Bypass cache read if profile cache is explicitly disabled via env
		if os.Getenv("DISABLE_PROFILE_CACHE") == "true" {
			uncachedIds = append(uncachedIds, id)
			continue
		}

		if val, ok := r.profileCache.Load(id); ok {
			entry := val.(profileCacheEntry)
			if now.Before(entry.expiresAt) {
				results[id] = entry.profile
				if entry.profile.ClerkUserId != "" {
					results[entry.profile.ClerkUserId] = entry.profile
				}
				if entry.profile.UserID != "" {
					results[entry.profile.UserID] = entry.profile
				}
				continue
			} else {
				r.profileCache.Delete(id)
			}
		}
		uncachedIds = append(uncachedIds, id)
	}

	if len(uncachedIds) == 0 {
		return results, nil
	}

	var uuidList []string
	var clerkIdList []string
	for _, id := range uncachedIds {
		if len(id) == 36 && strings.Count(id, "-") == 4 {
			uuidList = append(uuidList, id)
		} else {
			clerkIdList = append(clerkIdList, id)
		}
	}

	var rawProfiles []struct {
		profileResponse
		Users struct {
			ClerkUserId string `json:"clerk_user_id"`
		} `json:"users"`
	}

	g, gCtx := errgroup.WithContext(ctx)
	var mu sync.Mutex

	// Parallel Fetch 1: Clerk profiles
	if len(clerkIdList) > 0 {
		g.Go(func() error {
			idsParam := fmt.Sprintf("(\"%s\")", strings.Join(clerkIdList, "\",\"")) 
			profilesURL := fmt.Sprintf("%s/rest/v1/profiles?select=user_id,name,age,gender,personality,location,smoking,drinking,religion,interests,languages,nationality,job,profile_photo,bio,food_preference,travel_intentions,users!inner(clerk_user_id)&users.clerk_user_id=in.%s", r.url, idsParam)
			
			req, _ := http.NewRequestWithContext(gCtx, "GET", profilesURL, nil)
			req.Header.Set("apikey", r.anonKey)
			req.Header.Set("Authorization", "Bearer "+r.anonKey)
			
			resp, err := r.client.Do(req)
			if err != nil {
				log.Printf("Supabase ClerkID Fetch Failed: %v", err)
				return nil
			}
			defer resp.Body.Close()

			if resp.StatusCode == http.StatusOK {
				var chunk []struct {
					profileResponse
					Users struct {
						ClerkUserId string `json:"clerk_user_id"`
					} `json:"users"`
				}
				if err := json.NewDecoder(resp.Body).Decode(&chunk); err == nil {
					mu.Lock()
					rawProfiles = append(rawProfiles, chunk...)
					mu.Unlock()
				}
			}
			return nil
		})
	}

	// Parallel Fetch 2: UUID profiles
	if len(uuidList) > 0 {
		g.Go(func() error {
			idsParam := fmt.Sprintf("(\"%s\")", strings.Join(uuidList, "\",\"")) 
			profilesURL := fmt.Sprintf("%s/rest/v1/profiles?select=user_id,name,age,gender,personality,location,smoking,drinking,religion,interests,languages,nationality,job,profile_photo,bio,food_preference,travel_intentions,users(clerk_user_id)&user_id=in.%s", r.url, idsParam)
			
			req, _ := http.NewRequestWithContext(gCtx, "GET", profilesURL, nil)
			req.Header.Set("apikey", r.anonKey)
			req.Header.Set("Authorization", "Bearer "+r.anonKey)
			
			resp, err := r.client.Do(req)
			if err != nil {
				log.Printf("Supabase UUID Fetch Failed: %v", err)
				return nil
			}
			defer resp.Body.Close()

			if resp.StatusCode == http.StatusOK {
				var chunk []struct {
					profileResponse
					Users struct {
						ClerkUserId string `json:"clerk_user_id"`
					} `json:"users"`
				}
				if err := json.NewDecoder(resp.Body).Decode(&chunk); err == nil {
					mu.Lock()
					rawProfiles = append(rawProfiles, chunk...)
					mu.Unlock()
				}
			}
			return nil
		})
	}

	g.Wait()

	// Populate fetched profiles into the results map
	for _, raw := range rawProfiles {
		p := raw.profileResponse
		clerkID := raw.Users.ClerkUserId
		uuid := p.UserID

		attr := &models.StaticAttributes{
			UserID:      uuid,
			ClerkUserId: clerkID,
		}

		// Inject pre-resolved coordinates from session if available (High Priority)
		if coords, ok := preResolved[uuid]; ok && (coords.Lat != 0 || coords.Lon != 0) {
			attr.Location = coords
			log.Printf("Supabase: Using pre-resolved coordinates for %s: %+v", uuid, coords)
		} else if coords, ok := preResolved[clerkID]; ok && (coords.Lat != 0 || coords.Lon != 0) {
			attr.Location = coords
			log.Printf("Supabase: Using pre-resolved coordinates for %s: %+v", clerkID, coords)
		}

		if p.Name != nil { attr.Name = *p.Name }
		if p.Age != nil { attr.Age = *p.Age }
		if p.Gender != nil { attr.Gender = *p.Gender }
		if p.Personality != nil { attr.Personality = *p.Personality }
		if p.Smoking != nil { attr.Smoking = *p.Smoking }
		if p.Drinking != nil { attr.Drinking = *p.Drinking }
		if p.Religion != nil { attr.Religion = *p.Religion }
		if p.Nationality != nil { attr.Nationality = *p.Nationality }
		if p.Profession != nil { attr.Profession = *p.Profession }
		attr.GeoSource = "static" // Default to static/db

		if p.Avatar != nil { attr.Avatar = *p.Avatar }
		if p.Bio != nil { attr.Bio = *p.Bio }
		if p.FoodPreference != nil { attr.FoodPreference = *p.FoodPreference }
		attr.Interests = p.Interests
		attr.Languages = p.Languages

		// Parse travel_intentions from raw JSON
		if p.TravelIntentions != nil {
			var intentions []models.TravelIntention
			if strVal, ok := p.TravelIntentions.(string); ok {
				if err := json.Unmarshal([]byte(strVal), &intentions); err == nil {
					attr.TravelIntentions = intentions
				}
			} else {
				raw, err := json.Marshal(p.TravelIntentions)
				if err == nil {
					if err := json.Unmarshal(raw, &intentions); err == nil {
						attr.TravelIntentions = intentions
					}
				}
			}
		}

		if p.Location != nil {
			if m, ok := p.Location.(map[string]interface{}); ok {
				lat := parseCoord(m["lat"])
				if lat == 0 { lat = parseCoord(m["latitude"]) }
				lon := parseCoord(m["lon"])
				if lon == 0 { lon = parseCoord(m["longitude"]) }

				attr.Location.Lat = lat
				attr.Location.Lon = lon
				
				if attr.Location.Lat == 0 && p.Latitude != nil { attr.Location.Lat = *p.Latitude }
				if attr.Location.Lon == 0 && p.Longitude != nil { attr.Location.Lon = *p.Longitude }

				if attr.Location.Lat != 0 || attr.Location.Lon != 0 {
					log.Printf("Supabase: Successfully mapped location for %s: %+v", uuid, attr.Location)
				} else {
					log.Printf("Supabase WARNING: Location found for %s but keys are zero or invalid. Raw: %+v", uuid, m)
				}
			} else if s, ok := p.Location.(string); ok {
				attr.RawLocation = strings.TrimSpace(s)
			} else {
				log.Printf("Supabase WARNING: Location field for %s is not a JSON object or string, got type: %T", uuid, p.Location)
			}
		}
		if attr.Location.Lat != 0 || attr.Location.Lon != 0 {
			attr.GeoSource = "resolved"
		}
		
		if uuid != "" { results[uuid] = attr }
		if clerkID != "" { results[clerkID] = attr }
	}

	// STEP 4: Trigger Parallel Geocode for RawLocations (Non-blocking)
	for _, attr := range results {
		if attr.RawLocation != "" && attr.Location.Lat == 0 && attr.Location.Lon == 0 {
			r.GeocodeGeoapify(ctx, attr.RawLocation)
			attr.GeoSource = "background_pending"
		}
	}

	// Cache the newly fetched profiles with a 10-minute TTL for production efficiency
	expiresAt := time.Now().Add(10 * time.Minute)
	for _, attr := range results {
		entry := profileCacheEntry{
			profile:   attr,
			expiresAt: expiresAt,
		}
		if attr.ClerkUserId != "" {
			r.profileCache.Store(attr.ClerkUserId, entry)
		}
		if attr.UserID != "" {
			r.profileCache.Store(attr.UserID, entry)
		}
	}

	return results, nil
}
