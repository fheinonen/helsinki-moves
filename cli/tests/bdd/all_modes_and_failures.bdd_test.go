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
	fixtureBusAndTramAvailable      allModesFixture = "bus and tram available"
	fixtureBusOnlyAvailable         allModesFixture = "bus only available"
	fixtureTramUnavailable          allModesFixture = "tram unavailable"
	fixtureNoAllModeResults         allModesFixture = "no departures available"
	fixtureAllModesUnavailable      allModesFixture = "all modes unavailable"
	fixtureSingleModeDeparturesFail allModesFixture = "single-mode departures fail"
)

func TestAllModesAndFailuresScenarios(t *testing.T) {
	now := time.Date(2026, time.March, 19, 15, 0, 0, 0, time.FixedZone("EET", 2*60*60))

	scenarios, err := testruntime.LoadScenarios(filepath.Join("all_modes_and_failures.scenarios.txt"), func(line string, sc *testruntime.Scenario) error {
		switch {
		case strings.HasPrefix(line, "Given geocoding finds "):
			sc.Values["label"] = strings.TrimSpace(strings.Trim(strings.TrimPrefix(line, "Given geocoding finds "), `"`))
			return nil
		case line == "Given bus and tram departures are available across all modes":
			sc.Values["fixture"] = string(fixtureBusAndTramAvailable)
			return nil
		case line == "Given bus departures are available across all modes":
			sc.Values["fixture"] = string(fixtureBusOnlyAvailable)
			return nil
		case line == "Given bus departures are available while tram is unavailable across all modes":
			sc.Values["fixture"] = string(fixtureTramUnavailable)
			return nil
		case line == "Given no departures are available across all modes":
			sc.Values["fixture"] = string(fixtureNoAllModeResults)
			return nil
		case line == "Given every mode is unavailable across all modes":
			sc.Values["fixture"] = string(fixtureAllModesUnavailable)
			return nil
		case line == "Given the departures API returns an internal server error for single-mode queries":
			sc.Values["fixture"] = string(fixtureSingleModeDeparturesFail)
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
					_ = json.NewEncoder(w).Encode(allModesGeocodeResponse(geocodeQuery(sc.Args), sc.Values["label"]))
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

func allModesGeocodeResponse(query, label string) map[string]any {
	if label == "" {
		label = "Pasila, Helsinki"
	}
	return map[string]any{
		"ambiguous": false,
		"choices":   []any{},
		"location": map[string]any{
			"confidence": 0.95,
			"label":      label,
			"latitude":   60.2,
			"longitude":  24.9,
		},
		"query": query,
	}
}

func writeAllModesDepartureResponse(w http.ResponseWriter, fixture allModesFixture, r *http.Request) bool {
	mode := r.URL.Query().Get("mode")
	if fixture == fixtureSingleModeDeparturesFail || fixture == fixtureAllModesUnavailable || fixture == fixtureTramUnavailable && mode == "TRAM" {
		http.Error(w, "Internal Server Error", http.StatusInternalServerError)
		return false
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(allModesDepartureResponse(fixture, mode))
	return true
}

func allModesDepartureResponse(fixture allModesFixture, mode string) map[string]any {
	switch fixture {
	case fixtureBusAndTramAvailable:
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
	case fixtureBusOnlyAvailable, fixtureTramUnavailable:
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
