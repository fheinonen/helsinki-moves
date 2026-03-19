package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"path"
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
		var body struct {
			Message string `json:"message"`
		}
		_ = json.NewDecoder(resp.Body).Decode(&body)
		if body.Message != "" {
			return GeocodeResponse{}, fmt.Errorf("API error (%d): %s", resp.StatusCode, body.Message)
		}
		return GeocodeResponse{}, fmt.Errorf("API error (%d)", resp.StatusCode)
	}

	var out GeocodeResponse
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return GeocodeResponse{}, err
	}
	return out, nil
}
