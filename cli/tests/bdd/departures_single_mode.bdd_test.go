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

type departuresFixture string

const (
	fixtureLocationBus departuresFixture = "location bus departures"
	fixtureStopFlow    departuresFixture = "stop precision departures"
	fixtureLineFilter  departuresFixture = "line filtered departures"
	fixtureJSON        departuresFixture = "json departures"
)

func TestSingleModeDepartureScenarios(t *testing.T) {
	now := time.Date(2026, time.March, 19, 15, 0, 0, 0, time.FixedZone("EET", 2*60*60))

	scenarios, err := testruntime.LoadScenarios(filepath.Join("departures_single_mode.scenarios.txt"), func(line string, sc *testruntime.Scenario) error {
		if strings.HasPrefix(line, "Given the Helsinki Moves API departures fixture is ") {
			fixture, err := parseDeparturesFixture(strings.TrimPrefix(line, "Given the Helsinki Moves API departures fixture is "))
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
			var requests []testruntime.HTTPRequest
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				requests = append(requests, observedRequest(r))
				switch r.URL.Path {
				case "/api/v1/geocode":
					w.Header().Set("Content-Type", "application/json")
					_ = json.NewEncoder(w).Encode(departuresGeocodeResponse(departuresFixture(sc.Values["fixture"]), geocodeQuery(sc.Args)))
				case "/api/v1/departures":
					w.Header().Set("Content-Type", "application/json")
					_ = json.NewEncoder(w).Encode(departuresAPIResponse(departuresFixture(sc.Values["fixture"]), departuresCallCount(requests)))
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

func parseDeparturesFixture(text string) (departuresFixture, error) {
	switch strings.TrimSpace(strings.Trim(text, `"`)) {
	case string(fixtureLocationBus):
		return fixtureLocationBus, nil
	case string(fixtureStopFlow):
		return fixtureStopFlow, nil
	case string(fixtureLineFilter):
		return fixtureLineFilter, nil
	case string(fixtureJSON):
		return fixtureJSON, nil
	default:
		return "", fmt.Errorf("unknown departures fixture %q", text)
	}
}

func departuresGeocodeResponse(fixture departuresFixture, query string) map[string]any {
	label := map[departuresFixture]string{
		fixtureLocationBus: "Vihdintie 17, Helsinki",
		fixtureStopFlow:    "Talontie, Helsinki",
		fixtureLineFilter:  "Kamppi, Helsinki",
		fixtureJSON:        "Pasila, Helsinki",
	}[fixture]

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

func departuresAPIResponse(fixture departuresFixture, call int) map[string]any {
	switch fixture {
	case fixtureLocationBus:
		return map[string]any{
			"mode":           "BUS",
			"selectedStopId": nil,
			"station": map[string]any{
				"departures": []any{
					departureJSON("2026-03-19T13:03:00Z", "57", "Munkkiniemi", "Vi0234", "HSL:1234", "Vihdintie", nil),
					departureJSON("2026-03-19T13:20:00Z", "58", "Kamppi", "Vi0234", "HSL:1234", "Vihdintie", nil),
				},
				"distanceMeters": 50,
				"stopCode":       "Vi0234",
				"stopCodes":      []any{"Vi0234"},
				"stopName":       "Vihdintie",
				"type":           "stop",
			},
			"stops": []any{
				map[string]any{"code": "Vi0234", "distanceMeters": 50, "id": "HSL:1234", "memberStopIds": []any{}, "name": "Vihdintie", "stopCodes": []any{"Vi0234"}},
			},
		}
	case fixtureStopFlow:
		if call == 1 {
			return map[string]any{
				"mode":           "BUS",
				"selectedStopId": nil,
				"station": map[string]any{
					"departures":     []any{},
					"distanceMeters": 20,
					"stopCode":       "Ta0101",
					"stopCodes":      []any{"Ta0101"},
					"stopName":       "Talontie",
					"type":           "stop",
				},
				"stops": []any{
					map[string]any{"code": "Ta0202", "distanceMeters": 10, "id": "HSL:2202", "memberStopIds": []any{}, "name": "Talontie laituri 2", "stopCodes": []any{"Ta0202"}},
				},
			}
		}
		return map[string]any{
			"mode":           "BUS",
			"selectedStopId": "HSL:2202",
			"station": map[string]any{
				"departures": []any{
					departureJSON("2026-03-19T13:04:00Z", "600", "Elielinaukio", "Ta0202", "HSL:2202", "Talontie laituri 2", nil),
				},
				"distanceMeters": 10,
				"stopCode":       "Ta0202",
				"stopCodes":      []any{"Ta0202"},
				"stopName":       "Talontie laituri 2",
				"type":           "stop",
			},
			"stops": []any{
				map[string]any{"code": "Ta0202", "distanceMeters": 10, "id": "HSL:2202", "memberStopIds": []any{}, "name": "Talontie laituri 2", "stopCodes": []any{"Ta0202"}},
			},
		}
	case fixtureLineFilter:
		return map[string]any{
			"mode":           "BUS",
			"selectedStopId": nil,
			"station": map[string]any{
				"departures": []any{
					departureJSON("2026-03-19T13:03:00Z", "57", "Munkkiniemi", "Ka0101", "HSL:3101", "Kampin terminaali", nil),
				},
				"distanceMeters": 40,
				"stopCode":       "Ka0101",
				"stopCodes":      []any{"Ka0101"},
				"stopName":       "Kampin terminaali",
				"type":           "stop",
			},
			"stops": []any{
				map[string]any{"code": "Ka0101", "distanceMeters": 40, "id": "HSL:3101", "memberStopIds": []any{}, "name": "Kampin terminaali", "stopCodes": []any{"Ka0101"}},
			},
		}
	case fixtureJSON:
		return map[string]any{
			"mode":           "RAIL",
			"selectedStopId": nil,
			"station": map[string]any{
				"departures": []any{
					departureJSON("2026-03-19T13:03:00Z", "I", "Helsinki", "Pa0001", "HSL:9001", "Pasilan asema", "4"),
				},
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
	default:
		return map[string]any{}
	}
}

func departureJSON(iso, line, destination, stopCode, stopID, stopName string, track any) map[string]any {
	return map[string]any{
		"departureIso": iso,
		"destination":  destination,
		"line":         line,
		"stopCode":     stopCode,
		"stopId":       stopID,
		"stopName":     stopName,
		"track":        track,
	}
}

func observedRequest(r *http.Request) testruntime.HTTPRequest {
	query := make(map[string]string, len(r.URL.Query()))
	for key, values := range r.URL.Query() {
		if len(values) > 0 {
			query[key] = values[0]
		}
	}
	return testruntime.HTTPRequest{Path: r.URL.Path, Query: query}
}

func departuresCallCount(requests []testruntime.HTTPRequest) int {
	count := 0
	for _, request := range requests {
		if request.Path == "/api/v1/departures" {
			count++
		}
	}
	return count
}
