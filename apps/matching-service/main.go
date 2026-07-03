package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"sort"
	"strings"
	"syscall"
	"time"

	"golang.org/x/sync/errgroup"

	"github.com/joho/godotenv"

	"github.com/kovari/matching-service/internal/ai"
	"github.com/kovari/matching-service/internal/auth"
	"github.com/kovari/matching-service/internal/config"
	"github.com/kovari/matching-service/internal/logger"
	"github.com/kovari/matching-service/internal/matching"
	"github.com/kovari/matching-service/internal/models"
	"github.com/kovari/matching-service/internal/repository"
)

var (
	mlClient *ai.MLClient
	sbRepo   *repository.SupabaseRepository
	repo     *repository.RedisRepository
)

func main() {
	// Root and app-level env loading
	rootEnv, _ := filepath.Abs("../../.env.local")
	webEnv, _ := filepath.Abs("../web/.env.local")
	
	if _, err := os.Stat(rootEnv); err == nil {
		godotenv.Load(rootEnv)
		log.Printf("Loaded environment from %s", rootEnv)
	}
	if _, err := os.Stat(webEnv); err == nil {
		godotenv.Load(webEnv)
		log.Printf("Loaded environment from %s", webEnv)
	}

	// 1. FAIL-FAST STARTUP CHECKS
	requiredEnv := []string{
		"REDIS_URL",
		"NEXT_PUBLIC_SUPABASE_URL",
		"SUPABASE_SERVICE_ROLE_KEY",
		"ML_SERVER_URL",
		"INTERNAL_API_SECRET_CURRENT",
		"GLOBAL_RATE_LIMIT",
	}
	for _, env := range requiredEnv {
		if os.Getenv(env) == "" {
			logger.Fatal(fmt.Sprintf("Missing required environment variable: %s", env), os.ErrNotExist)
		}
	}

	if err := auth.InitRateLimiter(); err != nil {
		logger.Fatal("Failed to initialize rate limiter", err)
	}

	redisURL := os.Getenv("REDIS_URL")
	sbURL := os.Getenv("NEXT_PUBLIC_SUPABASE_URL")
	sbKey := os.Getenv("SUPABASE_SERVICE_ROLE_KEY")
	geoKey := os.Getenv("GEOAPIFY_API_KEY")

	var err error
	repo, err = repository.NewRedisRepository(redisURL)
	if err != nil {
		logger.Fatal("Failed to connect to Redis", err)
	}

	// Fail-fast on Redis connection
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	if err := repo.Ping(ctx); err != nil {
		cancel()
		logger.Fatal("Redis ping failed during startup", err)
	}
	cancel()
	log.Printf("SUCCESS: Connected to Redis successfully.")

	sbRepo, err = repository.NewSupabaseRepository(sbURL, sbKey, geoKey, repo)
	if err != nil {
		logger.Fatal("Failed to connect to Supabase", err)
	}
	log.Printf("SUCCESS: Connected to Supabase (%s) successfully (Geoapify: %v, Cache: ENABLED).", sbURL, geoKey != "")

	mlClient = ai.NewMLClient()

	configPath := "../../packages/config/matching.json"
	matchConfig, configHash, err := config.LoadMatchingConfig(configPath)
	if err != nil {
		log.Printf("Warning: Could not load matching config from %s: %v. Using defaults.", configPath, err)
		matchConfig = &models.MatchingConfig{
			Version:       "v1",
			ConfigVersion: "DEFAULT",
			SoloWeights: map[string]float64{
				"destination": 0.25, "dates": 0.20, "budget": 0.20, "interests": 0.10,
				"personality": 0.10, "age": 0.05, "lifestyle": 0.05, "location": 0.05,
			},
			MLBlend: map[string]float64{"solo": 0.6, "group": 0.3},
		}
		configHash = "DEFAULT"
	}
	log.Printf("Loaded Config: %+v", matchConfig)
	log.Printf("Config Hash: %s", configHash)


	// --- HANDLERS ---

	healthHandler := func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("OK"))
	}

	readyHandler := func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
		defer cancel()

		if err := repo.Ping(ctx); err != nil {
			w.WriteHeader(http.StatusServiceUnavailable)
			json.NewEncoder(w).Encode(map[string]interface{}{
				"ready": false,
				"error": "Redis unreachable",
			})
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"ready":   true,
			"metrics": logger.GetMetrics(),
		})
	}

	soloHandler := func(w http.ResponseWriter, r *http.Request) {
		requestId := r.Context().Value(auth.ContextRequestID).(string)
		userId := r.Context().Value(auth.ContextUserID).(string)
		startTime := r.Context().Value(auth.ContextStartTime).(time.Time)

		if r.Method != http.MethodPost {
			auth.SendError(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "Only POST is allowed", r)
			return
		}

		r.Body = http.MaxBytesReader(w, r.Body, 1<<20) // 1MB limit
		var req struct{}
		dec := json.NewDecoder(r.Body)
		dec.DisallowUnknownFields()
		if err := dec.Decode(&req); err != nil && err != io.EOF {
			auth.SendError(w, http.StatusBadRequest, "INVALID_INPUT", "Malformed request or unknown fields", r)
			return
		}

		ctx := r.Context()
		
		if banned, err := sbRepo.IsUserBanned(ctx, userId); err != nil {
			log.Printf("Warning: ban check failed for %s: %v", userId, err)
		} else if banned {
			auth.SendError(w, http.StatusForbidden, "BANNED_USER", "Account has been banned", r)
			return
		}

		// STEP 1: Parallel Fetch sessions from Redis
		var userSession *models.SoloSession
		var candidates []models.SoloSession
		
		// Relaxed timeout for reliability
		redisCtx, redisCancel := context.WithTimeout(ctx, 60*time.Second)
		defer redisCancel()
		
		g, gCtx := errgroup.WithContext(redisCtx)
		tRedisStart := time.Now()
		
		g.Go(func() error {
			t1 := time.Now()
			var err error
			userSession, err = repo.GetSession(gCtx, userId)
			log.Printf("TIMER: Redis GetSession (%s) took: %v", userId, time.Since(t1))
			return err
		})
		
		g.Go(func() error {
			t1 := time.Now()
			var err error
			candidates, err = repo.FetchAllSessions(gCtx, userId)
			log.Printf("TIMER: Redis FetchAllSessions took: %v", time.Since(t1))
			return err
		})

		if err := g.Wait(); err != nil {
			log.Printf("Error: Redis fetch failed: %v", err)
			auth.SendError(w, 503, "STORAGE_ERROR", "Redis connection failed", r)
			return
		}
		log.Printf("TIMER: Step 1 (Total Redis Parallel) took: %v", time.Since(tRedisStart))

		if userSession == nil {
			log.Printf("Error: Session for %s not found in Redis", userId)
			auth.SendError(w, 404, "NOT_FOUND", "User session not found", r)
			return
		}

		// STEP 2: Hydrate ALL profiles in a single batch call (Deduplicated)
		allUserIds := []string{userId}
		candidateMap := make(map[string]models.SoloSession)
		seenIds := make(map[string]bool)
		seenIds[userId] = true
		
		for _, c := range candidates {
			if c.UserId != "" && !seenIds[c.UserId] {
				allUserIds = append(allUserIds, c.UserId)
				candidateMap[c.UserId] = c
				seenIds[c.UserId] = true
			}
		}

		// Collect pre-resolved coordinates from Redis sessions (Architecture Fix)
		preResolved := make(map[string]models.Coordinates)
		if userSession.Location.Lat != 0 || userSession.Location.Lon != 0 {
			preResolved[userSession.UserId] = userSession.Location
		}
		for _, c := range candidates {
			if c.Location.Lat != 0 || c.Location.Lon != 0 {
				preResolved[c.UserId] = c.Location
			}
		}

		log.Printf("STEP 2: Hydrating profiles for %d users", len(allUserIds))
		tHydrateStart := time.Now()

		profiles, err := sbRepo.FetchProfilesBatch(ctx, allUserIds, preResolved)
		if err != nil {
			log.Printf("Error: Profile hydration failed: %v", err)
			auth.SendError(w, 500, "DATABASE_ERROR", "Failed to fetch profiles", r)
			return
		}
		log.Printf("TIMER: Step 2 (Total Profile Hydration) took: %v", time.Since(tHydrateStart))

		// Apply profiles to sessions
		if p, ok := profiles[userId]; ok {
			userSession.StaticAttributes = p
		}

		var validCandidates []models.SoloSession
		for id, session := range candidateMap {
			if p, ok := profiles[id]; ok {
				session.StaticAttributes = p
				// NEW: Preserve coordinates from profile if session was missing them
				if session.Location.Lat == 0 && session.Location.Lon == 0 && (p.Location.Lat != 0 || p.Location.Lon != 0) {
					session.Location = p.Location
					session.GeoSource = "healed"
				}
				validCandidates = append(validCandidates, session)
			}
		}

		allowedIds, err := sbRepo.FilterBannedUserIds(ctx, allUserIds)
		if err != nil {
			log.Printf("Warning: banned user filter failed: %v", err)
		} else {
			filtered := validCandidates[:0]
			for _, c := range validCandidates {
				if allowedIds[c.UserId] {
					filtered = append(filtered, c)
				}
			}
			validCandidates = filtered
			if !allowedIds[userId] {
				auth.SendError(w, http.StatusForbidden, "BANNED_USER", "Account has been banned", r)
				return
			}
		}

		// NEW: Self-Healing Redis Loop (Async)
		go func(reqId string, sess *models.SoloSession, candidates []models.SoloSession) {
			// Small buffer to prevent write storms
			time.Sleep(50 * time.Millisecond)

			bgCtx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
			defer cancel()

			// Check requester
			if sess.Location.Lat != 0 || sess.Location.Lon != 0 {
				log.Printf("Self-Healing: Checking session %s for coordinate update", reqId)
				data, _ := json.Marshal(sess)
				// Use 7 days TTL (parity with Web API default)
				repo.SetCache(bgCtx, fmt.Sprintf("session:%s", reqId), string(data), 168*time.Hour)
			}
		}(userId, userSession, validCandidates)

		if userSession.StaticAttributes == nil {
			log.Printf("Error: Requester %s has no profile in Supabase", userId)
			auth.SendError(w, 400, "BAD_REQUEST", "Requester profile missing", r)
			return
		}

		// STEP 3: Parallel Logic (ML vs Rule-Based Feature Extraction)
		featuresList := make([]models.MLFeatures, 0, len(validCandidates))
		for _, match := range validCandidates {
			featuresList = append(featuresList, ai.ExtractSoloFeatures(*userSession, match))
		}

		var mlResults []models.MLPredictionResult
		var mlErr error
		mlUsed := false
		mlStartTime := time.Now()

		// Cloud environment ML Timeout (1000ms)
		mlCtx, mlCancel := context.WithTimeout(ctx, 1000*time.Millisecond)
		defer mlCancel()

		mlGroup, _ := errgroup.WithContext(mlCtx)
		mlGroup.Go(func() error {
			if len(featuresList) > 0 {
				mlResults, mlErr = mlClient.ScoreBatch(mlCtx, featuresList)
				if mlErr == nil {
					mlUsed = true
				} else {
					log.Printf("ML Warning: ML fallback active: %v", mlErr)
				}
			}
			return nil
		})

		mlGroup.Wait()
		mlLatency := time.Since(mlStartTime)

		// STEP 4: Final Scoring & Blending
		type ScoredMatch struct {
			UserId           string             `json:"userId"`
			User             models.UserPreview `json:"user"`
			Score            float64            `json:"score"`
			Breakdown        matching.Breakdown `json:"breakdown"`
			BudgetDifference string             `json:"budgetDifference"`
			StartDate        string             `json:"startDate"`
			EndDate          string             `json:"endDate"`
			Budget           float64            `json:"budget"`
			Destination      string             `json:"destination"`
		}

		finalMatches := make([]ScoredMatch, 0, len(validCandidates))
		for i, match := range validCandidates {
			var mlScore *float64
			if mlResults != nil && i < len(mlResults) && mlResults[i].Success {
				s := mlResults[i].Score
				mlScore = &s
			}

			// If the user has a search destination, check compatibility
			if userSession.Destination.Name != "" && 
				!strings.EqualFold(userSession.Destination.Name, "Any") && 
				!strings.EqualFold(userSession.Destination.Name, "Global") {
				userDestLower := strings.ToLower(userSession.Destination.Name)
				matchDestLower := strings.ToLower(match.Destination.Name)
				
				hasSessionOverlap := matchDestLower != "" && (
					strings.Contains(matchDestLower, userDestLower) || strings.Contains(userDestLower, matchDestLower))
				
				intentionScore := matching.CalculateIntentionOverlapScore(userSession.Destination, match.StaticAttributes.TravelIntentions)
				hasIntentionOverlap := intentionScore >= 0.8

				log.Printf("[FILTER DEBUG] Requester searching: %q | Candidate: %s (going to %q) | Session overlap: %v | Intention overlap: %v (score: %.2f)", 
					userSession.Destination.Name, match.StaticAttributes.Name, match.Destination.Name, hasSessionOverlap, hasIntentionOverlap, intentionScore)

				if !hasSessionOverlap && !hasIntentionOverlap {
					log.Printf("[FILTER DEBUG] SKIPPING candidate %s (no overlap)", match.StaticAttributes.Name)
					continue // Filter out candidate
				}
			}

			result := matching.CalculateFinalSoloScore(*userSession, match, mlScore, matchConfig)
			
			finalMatches = append(finalMatches, ScoredMatch{
				UserId: match.UserId,
				User: models.UserPreview{
					UserId:         match.UserId,
					Name:           match.StaticAttributes.Name,
					Age:            match.StaticAttributes.Age,
					Gender:         match.StaticAttributes.Gender,
					Personality:    match.StaticAttributes.Personality,
					Bio:            match.StaticAttributes.Bio,
					Avatar:         match.StaticAttributes.Avatar,
					Budget:         match.Budget,
					Interests:      match.StaticAttributes.Interests,
					Languages:      match.StaticAttributes.Languages,
					Smoking:        match.StaticAttributes.Smoking,
					Drinking:       match.StaticAttributes.Drinking,
					Nationality:    match.StaticAttributes.Nationality,
					Religion:       match.StaticAttributes.Religion,
					Profession:     match.StaticAttributes.Profession,
					FoodPreference: match.StaticAttributes.FoodPreference,
					Location:       match.StaticAttributes.RawLocation,
					LocationDisplay: match.StaticAttributes.RawLocation,
					TravelIntentions: match.StaticAttributes.TravelIntentions,
				},
				Score:            result.Score,
				Breakdown:        result.Breakdown,
				BudgetDifference: result.BudgetDifference,
				StartDate:        match.StartDate,
				EndDate:          match.EndDate,
				Budget:           match.Budget,
				Destination: func() string {
					if match.Destination.Name != "" {
						return match.Destination.Name
					}
					return userSession.Destination.Name
				}(),
			})
		}

		sort.Slice(finalMatches, func(i, j int) bool { return finalMatches[i].Score > finalMatches[j].Score })

		latency := time.Since(startTime)
		log.Printf("[MatchRequest] Requester:%s | Mode:%s | Candidates:%d | ML_USED:%v | ML_LATENCY:%v | Latency:%v",
			userId, matchConfig.Mode, len(finalMatches), mlUsed, mlLatency, latency)

		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("X-Response-Time", fmt.Sprintf("%dms", latency.Milliseconds()))
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": true,
			"data":    map[string]interface{}{"matches": finalMatches},
			"meta":    map[string]interface{}{"source": "go", "requestId": requestId, "latencyMs": latency.Milliseconds()},
		})
		logger.Info(requestId, userId, "Solo matches generated", http.StatusOK, latency, nil)
	}

	groupHandler := func(w http.ResponseWriter, r *http.Request) {
		requestId := r.Context().Value(auth.ContextRequestID).(string)
		userId := r.Context().Value(auth.ContextUserID).(string)
		startTime := r.Context().Value(auth.ContextStartTime).(time.Time)

		r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
		var req struct {
			Candidates []models.GroupProfile `json:"candidates"`
		}
		dec := json.NewDecoder(r.Body)
		dec.DisallowUnknownFields()
		if err := dec.Decode(&req); err != nil {
			auth.SendError(w, http.StatusBadRequest, "INVALID_INPUT", "Malformed request", r)
			return
		}

		if len(req.Candidates) > 50 {
			auth.SendError(w, http.StatusBadRequest, "INVALID_INPUT", "Too many candidates", r)
			return
		}

		ctx := r.Context()
		userSession, err := repo.GetSession(ctx, userId)
		if err != nil || userSession == nil {
			auth.SendError(w, 404, "NOT_FOUND", "User session not found", r)
			return
		}

		featuresList := make([]models.MLFeatures, 0, len(req.Candidates))
		for _, group := range req.Candidates {
			featuresList = append(featuresList, ai.ExtractGroupFeatures(*userSession, group))
		}

		mlCtx, mlCancel := context.WithTimeout(ctx, 1000*time.Millisecond)
		mlResults, _ := mlClient.ScoreBatch(mlCtx, featuresList)
		mlCancel()

		results := make([]models.GroupMatchResult, 0, len(req.Candidates))
		for i, group := range req.Candidates {
			var mlScore *float64
			if mlResults != nil && i < len(mlResults) && mlResults[i].Success {
				s := mlResults[i].Score
				mlScore = &s
			}
			score := matching.CalculateFinalGroupScore(*userSession, group, mlScore, matchConfig)
			results = append(results, score)
		}

		sort.Slice(results, func(i, j int) bool { return results[i].Score > results[j].Score })

		latency := time.Since(startTime)
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("X-Response-Time", fmt.Sprintf("%dms", latency.Milliseconds()))
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": true,
			"data":    map[string]interface{}{"groups": results},
			"meta":    map[string]interface{}{"source": "go", "requestId": requestId, "latencyMs": latency.Milliseconds()},
		})
		logger.Info(requestId, userId, "Group matches generated", http.StatusOK, latency, nil)
	}

	// Route definitions
	mux := http.NewServeMux()
	mux.HandleFunc("/health", healthHandler)
	mux.HandleFunc("/ready", readyHandler)
	mux.HandleFunc("/v1/match/solo", auth.SecurityMiddleware(repo, soloHandler))
	mux.HandleFunc("/v1/match/group", auth.SecurityMiddleware(repo, groupHandler))

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	server := &http.Server{
		Addr:         ":" + port,
		Handler:      mux,
		ReadTimeout:  5 * time.Second,
		WriteTimeout: 10 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	// 2. GRACEFUL SHUTDOWN
	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)

	go func() {
		logger.Info("", "", "Matching service starting on port "+port, 0, 0, nil)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.Fatal("Server failed to start", err)
		}
	}()

	<-stop
	logger.Info("", "", "Shutting down matching service...", 0, 0, nil)

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutdownCancel()

	if err := server.Shutdown(shutdownCtx); err != nil {
		logger.Fatal("Graceful shutdown failed", err)
	}
	logger.Info("", "", "Service stopped clean.", 0, 0, nil)
}
