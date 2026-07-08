package matching

import (
	"math"
	"strconv"
	"strings"
	"time"

	"github.com/kovari/matching-service/internal/models"
)

const (
	DefaultMaxDistanceKm = 200.0
	LocationMaxDistance  = 1500.0
)

func CalculateSoloDateOverlapScore(start1, end1, start2, end2 time.Time) float64 {
	overlapDays, tripDuration := CalculateDateOverlapSolo(start1, end1, start2, end2)
	if overlapDays < 1 || tripDuration <= 0 {
		return 0
	}

	ratio := overlapDays / tripDuration
	if ratio >= 0.8 {
		return 1.0
	}
	if ratio >= 0.5 {
		return 0.9
	}
	if ratio >= 0.3 {
		return 0.8
	}
	if ratio >= 0.2 {
		return 0.6
	}
	return 0.3
}

func GetHaversineDistance(lat1, lon1, lat2, lon2 float64) float64 {
	const R = 6371
	dLat := (lat2 - lat1) * (math.Pi / 180)
	dLon := (lon2 - lon1) * (math.Pi / 180)
	a := math.Sin(dLat/2)*math.Sin(dLat/2) +
		math.Cos(lat1*(math.Pi/180))*math.Cos(lat2*(math.Pi/180))*
			math.Sin(dLon/2)*math.Sin(dLon/2)
	c := 2 * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))
	return float64(R) * c
}

func CalculateDestinationScore(dest1, dest2 models.Destination, maxDistanceKm float64) float64 {
	// If either is missing (0,0), return 0.5 (Neutral fallback)
	if dest1.Lat == 0 || dest1.Lon == 0 || dest2.Lat == 0 || dest2.Lon == 0 {
		return 0.5
	}
	distance := GetHaversineDistance(dest1.Lat, dest1.Lon, dest2.Lat, dest2.Lon)
	if distance <= 10 {
		return 1.0
	}
	return math.Max(0, 1-distance/maxDistanceKm)
}

func CalculateLocationOriginScore(loc1, loc2 models.Coordinates, city1, city2 string) float64 {
	// If coordinates are missing, fallback to string-based city comparison
	if loc1.Lat == 0 || loc1.Lon == 0 || loc2.Lat == 0 || loc2.Lon == 0 {
		if city1 != "" && city2 != "" {
			if city1 == city2 {
				return 1.0
			}
		}
		return 0.5
	}
	distance := GetHaversineDistance(loc1.Lat, loc1.Lon, loc2.Lat, loc2.Lon)
	if distance <= 10 {
		return 1.0
	}
	
	// Parity: Improved range only used in 'enhanced' mode
	maxDist := DefaultMaxDistanceKm
	return 1.0 - math.Min(distance/maxDist, 1.0)
}

func CalculateLocationOriginScoreEnhanced(loc1, loc2 models.Coordinates, city1, city2 string) float64 {
	// If coordinates are missing, fallback to string-based city comparison
	if loc1.Lat == 0 || loc1.Lon == 0 || loc2.Lat == 0 || loc2.Lon == 0 {
		if city1 != "" && city2 != "" {
			if city1 == city2 {
				return 1.0
			}
		}
		return 0.5
	}
	distance := GetHaversineDistance(loc1.Lat, loc1.Lon, loc2.Lat, loc2.Lon)
	if distance <= 10 {
		return 1.0
	}
	return 1.0 - math.Min(distance/LocationMaxDistance, 1.0)
}

func CalculateBudgetScore(userBudget, matchBudget float64) float64 {
	maxB := math.Max(userBudget, matchBudget)
	if maxB == 0 {
		return 1.0
	}
	diff := math.Abs(userBudget - matchBudget)
	ratio := diff / maxB

	if ratio <= 0.1 {
		return 1.0
	}
	if ratio <= 0.25 {
		return 0.8
	}
	if ratio <= 0.5 {
		return 0.6
	}
	return math.Max(0.1, 1-ratio)
}

func GetPersonalityCompatibility(p1, p2 string) float64 {
	if p1 == "" || p2 == "" {
		return 0.5
	}
	if s, ok := personalityScores[p1]; ok {
		if v, ok := s[p2]; ok {
			return v
		}
	}
	return 0
}

func CalculateReligionScore(r1, r2 string, enhanced bool) float64 {
	if r1 == "" || r2 == "" {
		return 0.5
	}
	if r1 == r2 {
		return 1.0
	}

	for _, n := range religionNeutral {
		if r1 == n || r2 == n {
			return 0.5
		}
	}
	
	if enhanced {
		return 0.3 // Mismatch - partial score (requested bug fix)
	}
	return 0 // Legacy/Stable parity (Hard zero)
}

func CalculateAgeScore(age1, age2 int) float64 {
	if age1 == 0 || age2 == 0 {
		return 0.5 
	}
	diff := math.Abs(float64(age1 - age2))
	if diff <= 2 {
		return 1.0
	}
	if diff <= 5 {
		return 0.9
	}
	if diff <= 10 {
		return 0.7
	}
	return math.Max(0, 1-diff/30)
}

func CalculateLifestyleScore(smoke1, drink1, smoke2, drink2 string) float64 {
	smoke := 0.5
	if smoke1 == smoke2 {
		smoke = 1.0
	}

	drink := 0.5
	if drink1 == drink2 {
		drink = 1.0
	}
	return (smoke + drink) / 2
}

func CalculateIntentionOverlapScore(userDestLower string, matchIntentions []models.TravelIntention) float64 {
	if len(matchIntentions) == 0 || userDestLower == "" {
		return 0.5 // Neutral
	}
	bestScore := 0.0
	for _, intent := range matchIntentions {
		intentDest := intent.NormalizedDestination
		if strings.Contains(intentDest, userDestLower) || strings.Contains(userDestLower, intentDest) {
			score := 1.0
			if score > bestScore {
				bestScore = score
			}
		}
	}
	if bestScore == 0 {
		return 0.3 // No overlap penalty
	}
	return bestScore
}

type Breakdown struct {
	DestinationScore    float64 `json:"destinationScore"`
	DateOverlapScore    float64 `json:"dateOverlapScore"`
	BudgetScore         float64 `json:"budgetScore"`
	InterestScore       float64 `json:"interestScore"`
	PersonalityScore    float64 `json:"personalityScore"`
	ReligionScore       float64 `json:"religionScore"`
	AgeScore            float64 `json:"ageScore"`
	LifestyleScore      float64 `json:"lifestyleScore"`
	LocationOriginScore float64 `json:"locationOriginScore"`
	IntentionScore      float64 `json:"intentionScore"`
}

func (b *Breakdown) Round() {
	b.DestinationScore = math.Round(b.DestinationScore*1000) / 1000
	b.DateOverlapScore = math.Round(b.DateOverlapScore*1000) / 1000
	b.BudgetScore = math.Round(b.BudgetScore*1000) / 1000
	b.InterestScore = math.Round(b.InterestScore*1000) / 1000
	b.PersonalityScore = math.Round(b.PersonalityScore*1000) / 1000
	b.ReligionScore = math.Round(b.ReligionScore*1000) / 1000
	b.AgeScore = math.Round(b.AgeScore*1000) / 1000
	b.LifestyleScore = math.Round(b.LifestyleScore*1000) / 1000
	b.LocationOriginScore = math.Round(b.LocationOriginScore*1000) / 1000
	b.IntentionScore = math.Round(b.IntentionScore*1000) / 1000
}

type FinalScore struct {
	Score            float64   `json:"score"`
	Breakdown        Breakdown `json:"breakdown"`
	BudgetDifference string    `json:"budgetDifference"`
}

func CalculateFinalSoloScore(user, match models.SoloSession, mlScore *float64, config *models.MatchingConfig) FinalScore {
	uA := user.StaticAttributes
	if uA == nil {
		uA = &models.StaticAttributes{}
	}
	mA := match.StaticAttributes
	if mA == nil {
		mA = &models.StaticAttributes{}
	}

	// Improved logic gated by 'enhanced' mode
	isEnhanced := config.Mode == "enhanced"
	
	relScore := CalculateReligionScore(uA.NormalizedReligion, mA.NormalizedReligion, isEnhanced)
	var locScore float64
	if isEnhanced {
		locScore = CalculateLocationOriginScoreEnhanced(uA.Location, mA.Location, uA.NormalizedCity, mA.NormalizedCity)
	} else {
		locScore = CalculateLocationOriginScore(uA.Location, mA.Location, uA.NormalizedCity, mA.NormalizedCity)
	}

	userDestLower := strings.ToLower(user.Destination.Name)

	// Calculate raw scores first
	breakdown := Breakdown{
		DestinationScore:    CalculateDestinationScore(user.Destination, match.Destination, DefaultMaxDistanceKm),
		DateOverlapScore:    CalculateSoloDateOverlapScore(user.ParsedStartDate, user.ParsedEndDate, match.ParsedStartDate, match.ParsedEndDate),
		BudgetScore:         CalculateBudgetScore(user.Budget, match.Budget),
		InterestScore:       CalculateJaccardSimilarityOptimized(uA.NormalizedInterestsSet, mA.NormalizedInterestsSet),
		PersonalityScore:    GetPersonalityCompatibility(uA.NormalizedPersonality, mA.NormalizedPersonality),
		ReligionScore:       relScore,
		AgeScore:            CalculateAgeScore(uA.Age, mA.Age),
		LifestyleScore:      CalculateLifestyleScore(uA.NormalizedSmoking, uA.NormalizedDrinking, mA.NormalizedSmoking, mA.NormalizedDrinking),
		LocationOriginScore: locScore,
		IntentionScore:      CalculateIntentionOverlapScore(userDestLower, mA.TravelIntentions),
	}

	weights := config.SoloWeights
	
	// Sum raw values first
	intentionWeight := weights["intentions"]
	if intentionWeight == 0 {
		intentionWeight = 0.05 // Default weight if not in config
	}
	ruleBasedScore := breakdown.DestinationScore * weights["destination"] +
		breakdown.DateOverlapScore * weights["dates"] +
		breakdown.BudgetScore * weights["budget"] +
		breakdown.InterestScore * weights["interests"] +
		breakdown.PersonalityScore * weights["personality"] +
		breakdown.ReligionScore * (weights["religion"]) + 
		breakdown.AgeScore * weights["age"] +
		breakdown.LifestyleScore * weights["lifestyle"] +
		breakdown.LocationOriginScore * weights["location"] +
		breakdown.IntentionScore * intentionWeight
	
	finalScore := ruleBasedScore
	if mlScore != nil {
		mlBlend := config.MLBlend["solo"]
		finalScore = (*mlScore)*mlBlend + ruleBasedScore*(1.0-mlBlend)
	}

	// Final rounding matching TS logic
	finalScore = math.Round(finalScore*1000) / 1000

	// Round breakdown fields for the final response
	breakdown.Round()

	diff := match.Budget - user.Budget
	budgetDiffStr := "Same budget"
	if diff != 0 {
		sign := "+"
		if diff < 0 {
			sign = "-"
		}
		abs := math.Abs(diff)
		if abs >= 1000 {
			budgetDiffStr = sign + strconv.FormatFloat(abs/1000, 'f', 1, 64) + "k"
		} else {
			budgetDiffStr = sign + strconv.FormatFloat(abs, 'f', 0, 64)
		}
	}

	return FinalScore{
		Score:            finalScore,
		Breakdown:        breakdown,
		BudgetDifference: budgetDiffStr,
	}
}
