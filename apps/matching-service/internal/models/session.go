package models

import (
	"strings"
	"time"
)

type Coordinates struct {
	Lat float64 `json:"lat"`
	Lon float64 `json:"lon"`
}

type Destination struct {
	Name string  `json:"name,omitempty"`
	Lat  float64 `json:"lat"`
	Lon  float64 `json:"lon"`
}

type DestinationToCoords interface {
	ToCoords() Coordinates
}

func (d Destination) ToCoords() Coordinates {
	return Coordinates{Lat: d.Lat, Lon: d.Lon}
}

type StaticAttributes struct {
	UserID      string      `json:"userId,omitempty"`
	Name        string      `json:"name,omitempty"`
	ClerkUserId string      `json:"clerkUserId,omitempty"`
	Age         int         `json:"age"`
	Gender      string      `json:"gender"`
	Personality string      `json:"personality"`
	Location    Coordinates `json:"location"`
	Smoking     string      `json:"smoking"`
	Drinking    string      `json:"drinking"`
	Religion    string      `json:"religion"`
	Interests   []string    `json:"interests"`
	Language    string      `json:"language"`
	Languages   []string    `json:"languages,omitempty"`
	Nationality string      `json:"nationality"`
	Profession  string      `json:"profession"`
	Avatar      string      `json:"avatar,omitempty"`
	Bio         string      `json:"bio,omitempty"`
	RawLocation string      `json:"raw_location,omitempty"`
	GeoSource   string      `json:"geoSource,omitempty"`
	FoodPreference string   `json:"foodPreference,omitempty"`
	TravelIntentions []TravelIntention `json:"travel_intentions,omitempty"`

	// Pre-normalized fields for runtime optimization
	NormalizedInterestsSet map[string]bool `json:"-"`
	NormalizedReligion     string          `json:"-"`
	NormalizedPersonality  string          `json:"-"`
	NormalizedSmoking      string          `json:"-"`
	NormalizedDrinking     string          `json:"-"`
	NormalizedCity         string          `json:"-"`
}

type TravelIntention struct {
	Destination           string `json:"destination"`
	NormalizedDestination string `json:"-"`
	Timeframe             string `json:"timeframe"`
	IsConfirmed           bool   `json:"is_confirmed"`
}

func parseDateLocal(s string) time.Time {
	layouts := []string{time.RFC3339, "2006-01-02"}
	for _, l := range layouts {
		t, err := time.Parse(l, s)
		if err == nil {
			return t
		}
	}
	return time.Time{}
}

func (s *StaticAttributes) PopulateNormalizedFields() {
	if s == nil {
		return
	}
	
	// Caching religion, personality, smoking, drinking, and city
	s.NormalizedReligion = strings.ToLower(strings.TrimSpace(s.Religion))
	s.NormalizedPersonality = strings.ToLower(s.Personality)
	s.NormalizedSmoking = strings.ToLower(s.Smoking)
	s.NormalizedDrinking = strings.ToLower(s.Drinking)
	
	if s.RawLocation != "" {
		s.NormalizedCity = strings.Split(strings.ToLower(strings.TrimSpace(s.RawLocation)), ",")[0]
	}

	// Caching interests map
	if s.NormalizedInterestsSet == nil {
		s.NormalizedInterestsSet = make(map[string]bool, len(s.Interests))
		for _, interest := range s.Interests {
			clean := strings.ToLower(strings.TrimSpace(interest))
			if clean != "" {
				s.NormalizedInterestsSet[clean] = true
			}
		}
	}

	// Caching travel intentions destinations
	for i := range s.TravelIntentions {
		s.TravelIntentions[i].NormalizedDestination = strings.ToLower(s.TravelIntentions[i].Destination)
	}
}

type SoloSession struct {
	UserId           string            `json:"userId,omitempty"`
	ClerkUserId      string            `json:"clerkUserId,omitempty"`
	Destination      Destination       `json:"destination"`
	Budget           float64           `json:"budget"`
	StartDate        string            `json:"startDate"`
	EndDate          string            `json:"endDate"`
	Mode             string            `json:"mode"`
	Interests        []string          `json:"interests,omitempty"`
	Location         Coordinates       `json:"location,omitempty"`
	GeoSource        string            `json:"geoSource,omitempty"`
	StaticAttributes *StaticAttributes `json:"static_attributes,omitempty"`
	Static           *StaticAttributes `json:"static,omitempty"`

	// Pre-parsed time fields
	ParsedStartDate time.Time `json:"-"`
	ParsedEndDate   time.Time `json:"-"`
}

func (s *SoloSession) PopulateNormalizedFields() {
	if s == nil {
		return
	}
	if s.StaticAttributes != nil {
		s.StaticAttributes.PopulateNormalizedFields()
	} else if s.Static != nil {
		s.Static.PopulateNormalizedFields()
	}
	s.ParsedStartDate = parseDateLocal(s.StartDate)
	s.ParsedEndDate = parseDateLocal(s.EndDate)
}

type MatchingConfig struct {
	Version       string             `json:"version"`
	ConfigVersion string             `json:"configVersion"`
	Mode          string             `json:"mode"`
	SoloWeights   map[string]float64 `json:"soloWeights"`
	GroupWeights  map[string]float64 `json:"groupWeights"`
	MLBlend       map[string]float64 `json:"mlBlend"`
}

type GroupProfile struct {
	GroupId               string      `json:"groupId"`
	Name                  string      `json:"name"`
	Destination           Destination `json:"destination"`
	AverageBudget         float64     `json:"averageBudget"`
	StartDate             string      `json:"startDate"`
	EndDate               string      `json:"endDate"`
	AverageAge            float64     `json:"averageAge"`
	DominantLanguages     []string    `json:"dominantLanguages"`
	TopInterests          []string    `json:"topInterests"`
	SmokingPolicy         string      `json:"smokingPolicy"`
	DrinkingPolicy        string      `json:"drinkingPolicy"`
	DominantNationalities []string    `json:"dominantNationalities"`
	DistanceKm            float64     `json:"distanceKm,omitempty"`
	Size                  int         `json:"size,omitempty"`
}

type GroupMatchResult struct {
	Group            GroupProfile       `json:"group"`
	Score            float64            `json:"score"`
	MLScore          *float64           `json:"mlScore,omitempty"`
	Breakdown        map[string]float64 `json:"breakdown"`
	BudgetDifference string             `json:"budgetDifference,omitempty"`
}

type UserPreview struct {
	UserId      string   `json:"userId"`
	Name        string   `json:"name"`
	Age         int      `json:"age"`
	Gender      string   `json:"gender"`
	Personality string   `json:"personality"`
	Bio         string   `json:"bio"`
	Avatar      string   `json:"avatar"`
	Budget      float64  `json:"budget"`
	Location    string   `json:"location"`
	LocationDisplay string `json:"locationDisplay"`
	Smoking     string   `json:"smoking"`
	Drinking    string   `json:"drinking"`
	Interests   []string `json:"interests"`
	Languages   []string `json:"languages"`
	Nationality string   `json:"nationality"`
	Religion    string   `json:"religion"`
	Profession  string   `json:"profession"`
	FoodPreference string `json:"foodPreference"`
	TravelIntentions []TravelIntention `json:"travelIntentions,omitempty"`
}
