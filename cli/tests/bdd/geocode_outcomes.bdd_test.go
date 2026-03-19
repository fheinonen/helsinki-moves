package bdd_test

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	testruntime "hm/internal/testing"
)

type geocodeFixture string

const (
	fixtureKnownAddress geocodeFixture = "a known address"
	fixtureAmbiguous    geocodeFixture = "ambiguous"
	fixtureNoMatch      geocodeFixture = "no match"
)

func TestGeocodeOutcomesScenarios(t *testing.T) {
	scenarios, err := testruntime.LoadScenarios(filepath.Join("geocode_outcomes.scenarios.txt"), func(line string, sc *testruntime.Scenario) error {
		if strings.HasPrefix(line, "Given the Helsinki Moves API geocode response is ") {
			fixture, err := parseFixture(strings.TrimPrefix(line, "Given the Helsinki Moves API geocode response is "))
			if err != nil {
				return fmt.Errorf("scenario %q: %w", sc.Name, err)
			}
			sc.Values["fixture"] = string(fixture)
			return nil
		}
		return fmt.Errorf("unrecognized step in scenario %q: %q", sc.Name, line)
	})
	if err != nil {
		t.Fatal(err)
	}

	for _, sc := range scenarios {
		sc := sc
		t.Run(sc.Name, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.URL.Path != "/api/v1/geocode" {
					http.NotFound(w, r)
					return
				}
				if got, want := r.URL.Query().Get("q"), geocodeQuery(sc.Args); got != want {
					http.Error(w, fmt.Sprintf("unexpected query %q, want %q", got, want), http.StatusBadRequest)
					return
				}
				w.Header().Set("Content-Type", "application/json")
				_ = json.NewEncoder(w).Encode(geocodeResponse(geocodeFixture(sc.Values["fixture"]), geocodeQuery(sc.Args)))
			}))
			t.Cleanup(server.Close)

			rt := testruntime.NewRuntime(server.URL)
			got := rt.Run(sc.Args)
			testruntime.RunChecks(t, got, sc.Checks)
		})
	}
}

func parseFixture(text string) (geocodeFixture, error) {
	switch strings.TrimSpace(text) {
	case string(fixtureKnownAddress):
		return fixtureKnownAddress, nil
	case string(fixtureAmbiguous):
		return fixtureAmbiguous, nil
	case string(fixtureNoMatch):
		return fixtureNoMatch, nil
	default:
		return "", fmt.Errorf("unknown geocode fixture %q", text)
	}
}

func geocodeQuery(argv []string) string {
	for i := 0; i < len(argv); i++ {
		switch argv[i] {
		case "-l", "--location", "-s", "--stop":
			if i+1 < len(argv) {
				return argv[i+1]
			}
		}
	}
	return ""
}

func geocodeResponse(fixture geocodeFixture, query string) map[string]any {
	switch fixture {
	case fixtureKnownAddress:
		return map[string]any{
			"ambiguous": false,
			"choices":   []any{},
			"location": map[string]any{
				"confidence": 0.95,
				"label":      "Vihdintie 17, Helsinki",
				"latitude":   60.2,
				"longitude":  24.9,
			},
			"query": query,
		}
	case fixtureAmbiguous:
		return map[string]any{
			"ambiguous": true,
			"choices": []any{
				map[string]any{"confidence": 0.92, "label": "Vihdintie 17, Helsinki", "latitude": 60.2, "longitude": 24.9},
				map[string]any{"confidence": 0.78, "label": "Vihdintie, Espoo", "latitude": 60.21, "longitude": 24.8},
			},
			"location": nil,
			"query":    query,
		}
	case fixtureNoMatch:
		return map[string]any{
			"ambiguous": false,
			"choices":   []any{},
			"location":  nil,
			"query":     query,
		}
	default:
		return map[string]any{
			"ambiguous": false,
			"choices":   []any{},
			"location":  nil,
			"query":     query,
		}
	}
}
