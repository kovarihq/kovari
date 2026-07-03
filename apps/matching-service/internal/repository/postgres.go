package repository

import (
	"context"
	"fmt"
	"log"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/kovari/matching-service/internal/models"
)

type PostgresRepository struct {
	pool *pgxpool.Pool
}

func NewPostgresRepository(url string) (*PostgresRepository, error) {
	config, err := pgxpool.ParseConfig(url)
	if err != nil {
		return nil, fmt.Errorf("unable to parse DATABASE_URL: %w", err)
	}

	pool, err := pgxpool.NewWithConfig(context.Background(), config)
	if err != nil {
		return nil, fmt.Errorf("unable to create connection pool: %w", err)
	}

	return &PostgresRepository{pool: pool}, nil
}

func (r *PostgresRepository) Close() {
	r.pool.Close()
}

func (r *PostgresRepository) Ping(ctx context.Context) error {
	return r.pool.Ping(ctx)
}

// FetchProfilesBatch fetches profiles and related attributes for a list of clerk_user_ids
func (r *PostgresRepository) FetchProfilesBatch(ctx context.Context, clerkUserIds []string) (map[string]*models.StaticAttributes, error) {
	if len(clerkUserIds) == 0 {
		return make(map[string]*models.StaticAttributes), nil
	}

	// Profiles table query
	query := `
		SELECT 
			u.clerk_user_id,
			p.name, p.age, p.gender, p.personality, p.location,
			p.smoking, p.drinking, p.religion, p.interests, p.languages,
			p.nationality, p.job as profession, p.profile_photo as avatar, p.bio
		FROM users u
		LEFT JOIN profiles p ON u.id = p.user_id
		WHERE u.clerk_user_id = ANY($1) AND u."isDeleted" = false
		AND (u.banned = false OR (u.ban_expires_at IS NOT NULL AND u.ban_expires_at <= NOW()))
	`

	rows, err := r.pool.Query(ctx, query, clerkUserIds)
	if err != nil {
		return nil, fmt.Errorf("batch profile query failed: %w", err)
	}
	defer rows.Close()

	results := make(map[string]*models.StaticAttributes)
	for rows.Next() {
		var clerkId string
		var attr models.StaticAttributes
		
		// Temporary variables for fields that might be NULL or require mapping
		// location is a JSON column, interests/languages are text[] arrays
		var name, gender, personality, smoking, drinking, religion, nationality, profession, avatar, bio *string
		var age *int
		var locationJSON interface{} // to handle coordinates JSON or string
		var interests, languages []string

		err := rows.Scan(
			&clerkId,
			&name, &age, &gender, &personality, &locationJSON,
			&smoking, &drinking, &religion, &interests, &languages,
			&nationality, &profession, &avatar, &bio,
		)
		if err != nil {
			log.Printf("Warning: Failed to scan profile for %s: %v", clerkId, err)
			continue
		}

		attr.ClerkUserId = clerkId
		if name != nil { attr.Name = *name }
		if age != nil { attr.Age = *age }
		if gender != nil { attr.Gender = *gender }
		if personality != nil { attr.Personality = *personality }
		if smoking != nil { attr.Smoking = *smoking }
		if drinking != nil { attr.Drinking = *drinking }
		if religion != nil { attr.Religion = *religion }
		if nationality != nil { attr.Nationality = *nationality }
		if profession != nil { attr.Profession = *profession }
		if avatar != nil { attr.Avatar = *avatar }
		if bio != nil { attr.Bio = *bio }
		attr.Interests = interests
		attr.Languages = languages

		// Handle location mapping from JSON to Coordinates
		if locationJSON != nil {
			if m, ok := locationJSON.(map[string]interface{}); ok {
				if lat, ok := m["lat"].(float64); ok {
					attr.Location.Lat = lat
				} else if lat, ok := m["lat"].(float32); ok {
					attr.Location.Lat = float64(lat)
				}
				if lon, ok := m["lon"].(float64); ok {
					attr.Location.Lon = lon
				} else if lon, ok := m["lon"].(float32); ok {
					attr.Location.Lon = float64(lon)
				}
			}
		}
		
		results[clerkId] = &attr
	}

	if err := rows.Err(); err != nil {
		return results, err
	}

	log.Printf("Repository: Found profiles for %d of %d requested users", len(results), len(clerkUserIds))
	return results, nil
}
