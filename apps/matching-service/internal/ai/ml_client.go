package ai

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"time"

	"github.com/kovari/matching-service/internal/models"
)

type MLClient struct {
	BaseURL    string
	HTTPClient *http.Client
}

func NewMLClient() *MLClient {
	baseURL := os.Getenv("ML_SERVER_URL")
	if baseURL == "" {
		baseURL = "http://127.0.0.1:8001"
	}

	return &MLClient{
		BaseURL: baseURL,
		HTTPClient: &http.Client{
			Timeout: 1000 * time.Millisecond,
			Transport: &http.Transport{
				MaxIdleConns:        100,
				MaxIdleConnsPerHost: 100,
				IdleConnTimeout:     90 * time.Second,
			},
		},
	}
}

func (c *MLClient) ScoreBatch(ctx context.Context, featuresList []models.MLFeatures) ([]models.MLPredictionResult, error) {
	if len(featuresList) == 0 {
		return nil, nil
	}

	// 1000ms timeout for cloud environments
	ctx, cancel := context.WithTimeout(ctx, 1000*time.Millisecond)
	defer cancel()

	payload := models.MLBatchRequest{
		FeaturesList: featuresList,
		ModelDir:     "models",
	}

	jsonData, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequestWithContext(ctx, "POST", c.BaseURL+"/predict/batch", bytes.NewBuffer(jsonData))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.HTTPClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("ML batch request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("ML server returned status %d", resp.StatusCode)
	}

	var batchResp models.MLBatchResponse
	if err := json.NewDecoder(resp.Body).Decode(&batchResp); err != nil {
		return nil, err
	}

	if !batchResp.Success {
		return nil, fmt.Errorf("ML batch prediction unsuccessful: %s", batchResp.Error)
	}

	return batchResp.Results, nil
}
