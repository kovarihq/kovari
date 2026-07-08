package matching_test

import (
	"testing"

	"github.com/kovari/matching-service/internal/matching"
	"github.com/kovari/matching-service/internal/models"
)

var (
	benchmarkUser = models.SoloSession{
		Destination: models.Destination{Name: "mumbai", Lat: 19.0760, Lon: 72.8777},
		StartDate:   "2026-07-10",
		EndDate:     "2026-07-20",
		Budget:      1500,
		StaticAttributes: &models.StaticAttributes{
			Age:         28,
			Gender:      "male",
			Personality: "introvert",
			Religion:    "hindu",
			Smoking:     "no",
			Drinking:    "no",
			Interests:   []string{"Himalayan Treks", "Street food crawls", "Chai & conversations"},
			Languages:   []string{"english", "hindi"},
			Location:    models.Coordinates{Lat: 19.0760, Lon: 72.8777},
		},
	}
	
	benchmarkMatch = models.SoloSession{
		Destination: models.Destination{Name: "mumbai", Lat: 19.0760, Lon: 72.8777},
		StartDate:   "2026-07-12",
		EndDate:     "2026-07-18",
		Budget:      1500,
		StaticAttributes: &models.StaticAttributes{
			Age:         26,
			Gender:      "female",
			Personality: "ambivert",
			Religion:    "hindu",
			Smoking:     "no",
			Drinking:    "yes",
			Interests:   []string{"beach bumming", "street food crawls", "chai & conversations"},
			Languages:   []string{"english", "hindi"},
			Location:    models.Coordinates{Lat: 19.0760, Lon: 72.8777},
		},
	}

	benchmarkConfig = &models.MatchingConfig{
		Mode: "enhanced",
		SoloWeights: map[string]float64{
			"destination": 0.2,
			"dates":       0.15,
			"budget":      0.1,
			"interests":   0.15,
			"personality": 0.1,
			"religion":    0.05,
			"age":         0.1,
			"lifestyle":   0.05,
			"location":    0.05,
			"intentions":  0.05,
		},
	}
)

func BenchmarkCalculateFinalSoloScore(b *testing.B) {
	benchmarkUser.StaticAttributes.PopulateNormalizedFields()
	benchmarkMatch.StaticAttributes.PopulateNormalizedFields()

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_ = matching.CalculateFinalSoloScore(benchmarkUser, benchmarkMatch, nil, benchmarkConfig)
	}
}
