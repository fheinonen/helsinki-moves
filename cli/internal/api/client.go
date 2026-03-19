package api

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"path"
	"strconv"
	"strings"
)

const DefaultBaseURL = "https://helsinkimoves.fheinonen.eu"

type Client struct {
	baseURL string
	http    *http.Client
}

func NewClient(baseURL string) Client {
	return Client{baseURL: baseURL, http: http.DefaultClient}
}

func (c Client) Geocode(query string) (GeocodeResponse, error) {
	var out GeocodeResponse
	err := c.getJSON("api/v1/geocode", url.Values{"q": []string{query}}, &out)
	return out, err
}

func (c Client) Departures(params DeparturesParams) (DeparturesResponse, error) {
	values := url.Values{
		"lat":  []string{formatFloat(params.Lat)},
		"lon":  []string{formatFloat(params.Lon)},
		"mode": []string{strings.ToUpper(params.Mode)},
	}
	if params.Line != "" {
		values.Set("line", params.Line)
	}
	if params.Results != "" {
		values.Set("results", params.Results)
	}
	if params.StopID != "" {
		values.Set("stopId", params.StopID)
	}

	var out DeparturesResponse
	err := c.getJSON("api/v1/departures", values, &out)
	return out, err
}

func (c Client) getJSON(endpoint string, values url.Values, out any) error {
	requestURL, err := c.requestURL(endpoint, values)
	if err != nil {
		return err
	}

	resp, err := c.httpClient().Get(requestURL)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if err := checkAPIResponse(resp); err != nil {
		return err
	}
	return json.NewDecoder(resp.Body).Decode(out)
}

func (c Client) httpClient() *http.Client {
	if c.http != nil {
		return c.http
	}
	return http.DefaultClient
}

func (c Client) requestURL(endpoint string, values url.Values) (string, error) {
	u, err := url.Parse(c.baseURL)
	if err != nil {
		return "", fmt.Errorf("invalid base URL %q", c.baseURL)
	}
	u.Path = path.Join("/", u.Path, endpoint)
	u.RawQuery = values.Encode()
	return u.String(), nil
}

func checkAPIResponse(resp *http.Response) error {
	if resp.StatusCode == http.StatusOK {
		return nil
	}
	body, _ := io.ReadAll(resp.Body)
	if message := normalizeAPIErrorBody(body); message != "" {
		return fmt.Errorf("API error (%d): %s", resp.StatusCode, message)
	}
	return fmt.Errorf("API error (%d)", resp.StatusCode)
}

func formatFloat(v float64) string {
	return strconv.FormatFloat(v, 'f', -1, 64)
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
