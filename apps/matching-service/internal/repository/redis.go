package repository

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"strings"
	"sync"
	"time"

	"github.com/kovari/matching-service/internal/models"
	"github.com/redis/go-redis/v9"
)

type RedisRepository struct {
	client        *redis.Client
	indexInFlight sync.Map
}

func NewRedisRepository(url string) (*RedisRepository, error) {
	opts, err := redis.ParseURL(url)
	if err != nil {
		return nil, err
	}

	opts.DialTimeout = 30 * time.Second
	opts.ReadTimeout = 30 * time.Second
	opts.WriteTimeout = 30 * time.Second
	opts.PoolSize = 50
	opts.PoolTimeout = 30 * time.Second
	opts.MinIdleConns = 10
	opts.MaxRetries = 5

	client := redis.NewClient(opts)
	return &RedisRepository{client: client}, nil
}

func (r *RedisRepository) Ping(ctx context.Context) error {
	return r.client.Ping(ctx).Err()
}

const MaxCandidates = 500

func (r *RedisRepository) FetchAllSessions(ctx context.Context, excludeUserId string) ([]models.SoloSession, error) {
	var sessions []models.SoloSession
	var keys []string
	var err error

	keys, err = r.client.SMembers(ctx, "sessions:index").Result()

	if err != nil || len(keys) == 0 {
		var batch []string
		batch, _, _ = r.client.Scan(ctx, 0, "session:*", 20).Result()
		if len(batch) > 0 {
			keys = batch
		}

		if _, loaded := r.indexInFlight.LoadOrStore("rebuild", true); !loaded {
			go func() {
				defer r.indexInFlight.Delete("rebuild")
				bgCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
				defer cancel()

				log.Printf("BACKGROUND INDEX REBUILD START")
				var cursor uint64
				var allKeys []string
				for {
					var b []string
					b, cursor, err = r.client.Scan(bgCtx, cursor, "session:*", 250).Result()
					if err != nil {
						break
					}
					allKeys = append(allKeys, b...)
					if cursor == 0 || len(allKeys) >= MaxCandidates*4 {
						break
					}
				}

				if len(allKeys) > 0 {
					var ids []interface{}
					for _, k := range allKeys {
						id := strings.TrimPrefix(k, "session:")
						ids = append(ids, id)
					}
					r.client.Del(bgCtx, "sessions:index")
					r.client.SAdd(bgCtx, "sessions:index", ids...)
					r.client.Expire(bgCtx, "sessions:index", 1*time.Hour)
					log.Printf("BACKGROUND INDEX REBUILD SUCCESS: Indexed %d sessions", len(allKeys))
				}
			}()
		}
	}



	if len(keys) > 0 {
		var subKeys []string
		for _, key := range keys {
			if !strings.HasPrefix(key, "session:") {
				key = "session:" + key
			}
			if key != "session:"+excludeUserId {
				subKeys = append(subKeys, key)
			}
		}

		if len(subKeys) > 0 {
			if len(subKeys) > MaxCandidates {
				subKeys = subKeys[:MaxCandidates]
			}
			values, err := r.client.MGet(ctx, subKeys...).Result()
			if err != nil {
				return nil, fmt.Errorf("mget failed: %w", err)
			}

			for i, val := range values {
				if val == nil {
					continue
				}
				s, err := r.unmarshalSession(val.(string))
				if err != nil {
					log.Printf("Warning: Failed to parse session %s: %v", subKeys[i], err)
					continue
				}
				sessions = append(sessions, *s)
				if len(sessions) >= MaxCandidates {
					break
				}
			}
		}
	}


	return sessions, nil
}

func (r *RedisRepository) GetSession(ctx context.Context, userId string) (*models.SoloSession, error) {
	key := "session:" + userId

	data, err := r.client.Get(ctx, key).Result()
	if err != nil {
		if err == redis.Nil {
			return nil, nil
		}
		return nil, fmt.Errorf("get session failed: %w", err)
	}

	return r.unmarshalSession(data)
}

func (r *RedisRepository) unmarshalSession(data string) (*models.SoloSession, error) {
	var s models.SoloSession
	if err := json.Unmarshal([]byte(data), &s); err != nil {
		return nil, err
	}

	if s.UserId == "" {
		if s.ClerkUserId != "" {
			s.UserId = s.ClerkUserId
		} else if s.Static != nil && s.Static.ClerkUserId != "" {
			s.UserId = s.Static.ClerkUserId
		} else if s.StaticAttributes != nil && s.StaticAttributes.ClerkUserId != "" {
			s.UserId = s.StaticAttributes.ClerkUserId
		}
	}

	if s.StaticAttributes == nil && s.Static != nil {
		s.StaticAttributes = s.Static
	}

	return &s, nil
}

func (r *RedisRepository) GetCache(ctx context.Context, key string) (string, error) {
	return r.client.Get(ctx, key).Result()
}

func (r *RedisRepository) SetCache(ctx context.Context, key string, value string, expiration time.Duration) error {
	return r.client.Set(ctx, key, value, expiration).Err()
}

func (r *RedisRepository) SetNX(ctx context.Context, key string, value interface{}, expiration time.Duration) (bool, error) {
	return r.client.SetNX(ctx, key, value, expiration).Result()
}
