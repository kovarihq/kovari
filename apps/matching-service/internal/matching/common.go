package matching

import (
	"math"
	"strings"
	"time"
)

func parseDate(s string) time.Time {
	layouts := []string{time.RFC3339, "2006-01-02"}
	for _, l := range layouts {
		t, err := time.Parse(l, s)
		if err == nil {
			return t
		}
	}
	return time.Time{}
}

func CalculateDateOverlapSolo(start1, end1, start2, end2 string) (float64, float64) {
	s1 := parseDate(start1)
	e1 := parseDate(end1)
	s2 := parseDate(start2)
	e2 := parseDate(end2)

	if s1.IsZero() || e1.IsZero() || s2.IsZero() || e2.IsZero() {
		return 0, 0
	}

	overlapStart := s1
	if s2.After(s1) {
		overlapStart = s2
	}
	overlapEnd := e1
	if e2.Before(e1) {
		overlapEnd = e2
	}

	// Exclusive math for Solo: (end - start) / 24h
	if overlapStart.After(overlapEnd) {
		dur := float64(e1.Sub(s1).Hours() / 24)
		return 0, math.Max(0, dur)
	}

	overlapDays := float64(overlapEnd.Sub(overlapStart).Hours() / 24)
	tripDuration := float64(e1.Sub(s1).Hours() / 24)
	
	return math.Max(0, overlapDays), math.Max(0, tripDuration)
}

func CalculateDateOverlapGroup(start1, end1, start2, end2 string) (float64, float64) {
	s1 := parseDate(start1)
	e1 := parseDate(end1)
	s2 := parseDate(start2)
	e2 := parseDate(end2)

	if s1.IsZero() || e1.IsZero() || s2.IsZero() || e2.IsZero() {
		return 0, 0
	}

	overlapStart := s1
	if s2.After(s1) {
		overlapStart = s2
	}
	overlapEnd := e1
	if e2.Before(e1) {
		overlapEnd = e2
	}

	// Inclusive math for Group: (end - start) / 24h + 1
	if overlapStart.After(overlapEnd) {
		dur := float64(e1.Sub(s1).Hours()/24) + 1
		return 0, math.Max(1, dur)
	}

	overlapDays := float64(overlapEnd.Sub(overlapStart).Hours()/24) + 1
	tripDuration := float64(e1.Sub(s1).Hours()/24) + 1

	return math.Max(0, overlapDays), math.Max(1, tripDuration)
}

func getInterestWeight(interest string) float64 {
	clean := strings.ToLower(strings.TrimSpace(interest))
	switch clean {
	// Outdoor Adventure (Weight: 1.5)
	case "himalayan treks", "camping & stargazing", "river rafting", "skiing & snow", "wildlife & safaris", "beach bumming", "scuba & snorkeling", "island hopping":
		return 1.5
	// Travel Style (Weight: 1.2)
	case "solo backpacking", "weekend getaways", "long-term travel", "workations", "road trips", "train journeys":
		return 1.2
	// Food & Social (Weight: 0.8)
	case "street food crawls", "local markets", "chai & conversations", "nightlife & clubs":
		return 0.8
	// Default / Culture & Art / Content (Weight: 1.0)
	default:
		return 1.0
	}
}

func CalculateJaccardSimilarity(a, b []string) float64 {
	if len(a) == 0 || len(b) == 0 {
		return 0.5
	}

	setA := make(map[string]bool)
	for _, v := range a {
		clean := strings.ToLower(strings.TrimSpace(v))
		if clean != "" {
			setA[clean] = true
		}
	}
	setB := make(map[string]bool)
	for _, v := range b {
		clean := strings.ToLower(strings.TrimSpace(v))
		if clean != "" {
			setB[clean] = true
		}
	}

	intersectionWeight := 0.0
	unionWeight := 0.0

	// Calculate weighted intersection
	for k := range setA {
		if setB[k] {
			intersectionWeight += getInterestWeight(k)
		}
	}

	if intersectionWeight == 0 {
		return 0.1
	}

	// Calculate weighted union
	for k := range setA {
		unionWeight += getInterestWeight(k)
	}
	for k := range setB {
		if !setA[k] {
			unionWeight += getInterestWeight(k)
		}
	}

	jaccard := intersectionWeight / unionWeight

	// Calculate weighted overlap coefficient
	lenAWeight := 0.0
	for k := range setA {
		lenAWeight += getInterestWeight(k)
	}
	lenBWeight := 0.0
	for k := range setB {
		lenBWeight += getInterestWeight(k)
	}
	minWeight := lenAWeight
	if lenBWeight < minWeight {
		minWeight = lenBWeight
	}
	overlap := intersectionWeight / minWeight

	// Hybrid approach: (Overlap + Jaccard) / 2
	return (jaccard + overlap) / 2
}
