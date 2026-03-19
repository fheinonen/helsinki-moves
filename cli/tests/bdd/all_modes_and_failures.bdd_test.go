package bdd_test

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"

	testruntime "hm/internal/testing"
)

type allModesFixture string

const (
	fixtureMergedAllModes     allModesFixture = "merged departures"
	fixturePartialAllFailure  allModesFixture = "partial failure"
	fixtureNoAllModeResults   allModesFixture = "no departures"
	fixtureDeparturesAPIFault allModesFixture = "departures API failure"
)

func TestAllModesAndFailuresScenarios(t *testing.T) {
	now := time.Date(2026, time.March, 19, 15, 0, 0, 0, time.FixedZone("EET", 2*60*60))

	scenarios, err := testruntime.LoadScenarios(filepath.Join("all_modes_and_failures.scenarios.txt"), func(line string, sc *testruntime.Scenario) error {
		switch {
		case strings.HasPrefix(line, "Given the Helsinki Moves API all-modes fixture is "):
			fixture, err := parseAllModesFixture(strings.TrimPrefix(line, "Given the Helsinki Moves API all-modes fixture is "))
			if err != nil {
				return fmt.Errorf("scenario %q: %w", sc.Name, err)
			}
			sc.Values["fixture"] = string(fixture)
			return nil
		case line == "Given the Helsinki Moves API is unreachable":
			sc.Values["baseURL"] = "http://127.0.0.1:1"
			return nil
		default:
			return fmt.Errorf("unrecognized step in scenario %q: %q", sc.Name, line)
		}
	})
	if err != nil {
		t.Fatal(err)
	}

	for _, sc := range scenarios {
		sc := sc
		t.Run(sc.Name, func(t *testing.T) {
			if sc.Values["baseURL"] != "" {
				rt := testruntime.NewRuntime(sc.Values["baseURL"]).WithClock(func() time.Time { return now }, now.Location())
				got := rt.Run(sc.Args)
				testruntime.RunChecks(t, got, sc.Checks)
				return
			}

			var requests []testruntime.HTTPRequest
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				requests = append(requests, observedRequest(r))
				switch r.URL.Path {
				case "/api/v1/geocode":
					w.Header().Set("Content-Type", "application/json")
					_ = json.NewEncoder(w).Encode(allModesGeocodeResponse(geocodeQuery(sc.Args)))
				case "/api/v1/departures":
					if !writeAllModesDepartureResponse(w, allModesFixture(sc.Values["fixture"]), r) {
						return
					}
				default:
					http.NotFound(w, r)
				}
			}))
			t.Cleanup(server.Close)

			rt := testruntime.NewRuntime(server.URL).WithClock(func() time.Time { return now }, now.Location())
			got := rt.Run(sc.Args)
			testruntime.RunChecksWithEvidence(t, testruntime.Evidence{Result: got, Requests: requests}, sc.Checks)
		})
	}
}

func parseAllModesFixture(text string) (allModesFixture, error) {
	switch strings.TrimSpace(strings.Trim(text, `"`)) {
	case string(fixtureMergedAllModes):
		return fixtureMergedAllModes, nil
	case string(fixturePartialAllFailure):
		return fixturePartialAllFailure, nil
	case string(fixtureNoAllModeResults):
		return fixtureNoAllModeResults, nil
	case string(fixtureDeparturesAPIFault):
		return fixtureDeparturesAPIFault, nil
	default:
		return "", fmt.Errorf("unknown all-modes fixture %q", text)
	}
}

func allModesGeocodeResponse(query string) map[string]any {
	return map[string]any{
		"ambiguous": false,
		"choices":   []any{},
		"location": map[string]any{
			"confidence": 0.95,
			"label":      "Pasila, Helsinki",
			"latitude":   60.2,
			"longitude":  24.9,
		},
		"query": query,
	}
}

func writeAllModesDepartureResponse(w http.ResponseWriter, fixture allModesFixture, r *http.Request) bool {
	mode := r.URL.Query().Get("mode")
	if fixture == fixtureDeparturesAPIFault || fixture == fixturePartialAllFailure && mode == "TRAM" {
		http.Error(w, "Internal Server Error", http.StatusInternalServerError)
		return false
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(allModesDepartureResponse(fixture, mode))
	return true
}

func allModesDepartureResponse(fixture allModesFixture, mode string) map[string]any {
	switch fixture {
	case fixtureMergedAllModes:
		switch mode {
		case "BUS":
			return departurePayload("BUS", []map[string]any{
				departureJSON("2026-03-19T13:03:00Z", "57", "Munkkiniemi", "Pa0001", "HSL:9001", "Pasilan asema", nil),
			})
		case "TRAM":
			return departurePayload("TRAM", []map[string]any{
				departureJSON("2026-03-19T13:07:00Z", "9", "Jatkasaari", "Pa0001", "HSL:9001", "Pasilan asema", nil),
			})
		default:
			return departurePayload(mode, []map[string]any{})
		}
	case fixturePartialAllFailure:
		if mode == "BUS" {
			return departurePayload("BUS", []map[string]any{
				departureJSON("2026-03-19T13:03:00Z", "57", "Munkkiniemi", "Pa0001", "HSL:9001", "Pasilan asema", nil),
			})
		}
		return departurePayload(mode, []map[string]any{})
	case fixtureNoAllModeResults:
		return departurePayload(mode, []map[string]any{})
	default:
		return departurePayload(mode, []map[string]any{})
	}
}

func departurePayload(mode string, departures []map[string]any) map[string]any {
	return map[string]any{
		"mode":           mode,
		"selectedStopId": nil,
		"station": map[string]any{
			"departures":     departures,
			"distanceMeters": 25,
			"stopCode":       "Pa0001",
			"stopCodes":      []any{"Pa0001"},
			"stopName":       "Pasilan asema",
			"type":           "station",
		},
		"stops": []any{
			map[string]any{"code": "Pa0001", "distanceMeters": 25, "id": "HSL:9001", "memberStopIds": []any{}, "name": "Pasilan asema", "stopCodes": []any{"Pa0001"}},
		},
	}
}
