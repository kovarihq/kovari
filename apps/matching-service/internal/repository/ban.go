package repository

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

type banStatusRow struct {
	Banned       bool    `json:"banned"`
	BanExpiresAt *string `json:"ban_expires_at"`
}

func isActiveBanRow(row banStatusRow) bool {
	if !row.Banned {
		return false
	}
	if row.BanExpiresAt == nil || *row.BanExpiresAt == "" {
		return true
	}
	expires, err := time.Parse(time.RFC3339, *row.BanExpiresAt)
	if err != nil {
		return true
	}
	return expires.After(time.Now())
}

// IsUserBanned checks whether a clerk user id or internal UUID is actively banned.
func (r *SupabaseRepository) IsUserBanned(ctx context.Context, userId string) (bool, error) {
	filterCol := "clerk_user_id"
	if strings.Contains(userId, "-") && len(userId) == 36 {
		filterCol = "id"
	}

	url := fmt.Sprintf(
		"%s/rest/v1/users?select=banned,ban_expires_at&%s=eq.%s&limit=1",
		r.url,
		filterCol,
		userId,
	)

	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return false, err
	}
	req.Header.Set("apikey", r.anonKey)
	req.Header.Set("Authorization", "Bearer "+r.anonKey)

	resp, err := r.client.Do(req)
	if err != nil {
		return false, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return false, fmt.Errorf("ban status fetch failed: %s", string(body))
	}

	var rows []banStatusRow
	if err := json.NewDecoder(resp.Body).Decode(&rows); err != nil {
		return false, err
	}
	if len(rows) == 0 {
		return false, nil
	}
	return isActiveBanRow(rows[0]), nil
}

// FilterBannedUserIds returns the subset of ids that are NOT actively banned.
func (r *SupabaseRepository) FilterBannedUserIds(ctx context.Context, ids []string) (map[string]bool, error) {
	allowed := make(map[string]bool, len(ids))
	if len(ids) == 0 {
		return allowed, nil
	}

	// Separate UUIDs and Clerk IDs
	var uuids []string
	var clerkIds []string
	for _, id := range ids {
		if strings.Contains(id, "-") && len(id) == 36 {
			uuids = append(uuids, id)
		} else {
			clerkIds = append(clerkIds, id)
		}
	}

	var conditions []string
	if len(uuids) > 0 {
		conditions = append(conditions, fmt.Sprintf("id.in.(%s)", strings.Join(uuids, ",")))
	}
	if len(clerkIds) > 0 {
		conditions = append(conditions, fmt.Sprintf("clerk_user_id.in.(%s)", strings.Join(clerkIds, ",")))
	}

	if len(conditions) == 0 {
		return allowed, nil
	}

	url := fmt.Sprintf(
		"%s/rest/v1/users?select=id,clerk_user_id,banned,ban_expires_at&or=(%s)",
		r.url,
		strings.Join(conditions, ","),
	)

	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("apikey", r.anonKey)
	req.Header.Set("Authorization", "Bearer "+r.anonKey)

	resp, err := r.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("ban status fetch failed: status=%d body=%s", resp.StatusCode, string(body))
	}

	var rows []struct {
		ID           string  `json:"id"`
		ClerkUserID  *string `json:"clerk_user_id"`
		Banned       bool    `json:"banned"`
		BanExpiresAt *string `json:"ban_expires_at"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&rows); err != nil {
		return allowed, err
	}

	bannedSet := make(map[string]bool)
	for _, row := range rows {
		if isActiveBanRow(banStatusRow{Banned: row.Banned, BanExpiresAt: row.BanExpiresAt}) {
			bannedSet[row.ID] = true
			if row.ClerkUserID != nil {
				bannedSet[*row.ClerkUserID] = true
			}
		}
	}

	for _, id := range ids {
		if !bannedSet[id] {
			allowed[id] = true
		}
	}

	return allowed, nil
}
