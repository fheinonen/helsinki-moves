package api

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"path"
	"strings"
)

type Client struct {
	baseURL string
	http    *http.Client
}

func NewClient(baseURL string) Client {
	return Client{baseURL: baseURL, http: http.DefaultClient}
}

func (c Client) Geocode(query string) (GeocodeResponse, error) {
	httpClient := c.http
	if httpClient == nil {
		httpClient = http.DefaultClient
	}

	u, err := url.Parse(c.baseURL)
	if err != nil {
		return GeocodeResponse{}, fmt.Errorf("invalid base URL %q", c.baseURL)
	}
	u.Path = path.Join("/", u.Path, "api/v1/geocode")
	u.RawQuery = url.Values{"q": []string{query}}.Encode()

	resp, err := httpClient.Get(u.String())
	if err != nil {
		return GeocodeResponse{}, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		if message := normalizeAPIErrorBody(body); message != "" {
			return GeocodeResponse{}, fmt.Errorf("API error (%d): %s", resp.StatusCode, message)
		}
		return GeocodeResponse{}, fmt.Errorf("API error (%d)", resp.StatusCode)
	}

	var out GeocodeResponse
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return GeocodeResponse{}, err
	}
	return out, nil
}

func normalizeAPIErrorBody(body []byte) string {
	text := strings.TrimSpace(string(body))
	if text == "" {
		return ""
	}

	var payload struct {
		Message string `json:"message"`
	}
	if err := json.Unmarshal(body, &payload); err == nil && payload.Message != "" {
		return payload.Message
	}
	return text
}
