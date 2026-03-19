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

func TestDeparturesSingleModeScenarios(t *testing.T) {
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
			var requests []departuresRequest
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				switch r.URL.Path {
				case "/api/v1/geocode":
					w.Header().Set("Content-Type", "application/json")
					_ = json.NewEncoder(w).Encode(departuresGeocodeResponse(departuresFixture(sc.Values["fixture"]), geocodeQuery(sc.Args)))
				case "/api/v1/departures":
					requests = append(requests, departuresRequest{
						Line:    r.URL.Query().Get("line"),
						Mode:    r.URL.Query().Get("mode"),
						StopID:  r.URL.Query().Get("stopId"),
						Results: r.URL.Query().Get("results"),
					})
					w.Header().Set("Content-Type", "application/json")
					_ = json.NewEncoder(w).Encode(departuresAPIResponse(departuresFixture(sc.Values["fixture"]), len(requests)))
				default:
					http.NotFound(w, r)
				}
			}))
			t.Cleanup(server.Close)

			rt := testruntime.NewRuntime(server.URL).WithClock(func() time.Time { return now }, now.Location())
			got := rt.Run(sc.Args)
			testruntime.RunChecks(t, got, sc.Checks)
			assertDeparturesRequests(t, departuresFixture(sc.Values["fixture"]), requests)
		})
	}
}

type departuresRequest struct {
	Line    string
	Mode    string
	StopID  string
	Results string
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

func assertDeparturesRequests(t *testing.T, fixture departuresFixture, requests []departuresRequest) {
	t.Helper()

	switch fixture {
	case fixtureLocationBus:
		if len(requests) != 1 {
			t.Fatalf("departures requests = %d, want 1", len(requests))
		}
		if requests[0].Mode != "BUS" {
			t.Fatalf("mode = %q, want %q", requests[0].Mode, "BUS")
		}
	case fixtureStopFlow:
		if len(requests) != 2 {
			t.Fatalf("departures requests = %d, want 2", len(requests))
		}
		if requests[0].StopID != "" {
			t.Fatalf("first stopId = %q, want empty", requests[0].StopID)
		}
		if requests[1].StopID != "HSL:2202" {
			t.Fatalf("second stopId = %q, want %q", requests[1].StopID, "HSL:2202")
		}
	case fixtureLineFilter:
		if len(requests) != 1 {
			t.Fatalf("departures requests = %d, want 1", len(requests))
		}
		if requests[0].Line != "57" {
			t.Fatalf("line = %q, want %q", requests[0].Line, "57")
		}
	case fixtureJSON:
		if len(requests) != 1 {
			t.Fatalf("departures requests = %d, want 1", len(requests))
		}
		if requests[0].Mode != "RAIL" {
			t.Fatalf("mode = %q, want %q", requests[0].Mode, "RAIL")
		}
	default:
		t.Fatalf("unexpected fixture %q", fixture)
	}
}
