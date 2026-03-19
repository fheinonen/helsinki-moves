package bdd_test

import (
	"bufio"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"

	testruntime "hm/internal/testing"
)

type geocodeScenario struct {
	name    string
	fixture geocodeFixture
	argv    []string
	checks  []check
}

type geocodeFixture string

const (
	fixtureKnownAddress geocodeFixture = "a known address"
	fixtureAmbiguous    geocodeFixture = "ambiguous"
	fixtureNoMatch      geocodeFixture = "no match"
)

func TestGeocodeOutcomesScenarios(t *testing.T) {
	scenarios, err := loadGeocodeScenarios(filepath.Join("geocode_outcomes.scenarios.txt"))
	if err != nil {
		t.Fatal(err)
	}

	for _, sc := range scenarios {
		sc := sc
		t.Run(sc.name, func(t *testing.T) {
			runGeocodeScenario(t, sc)
		})
	}
}

func loadGeocodeScenarios(path string) ([]geocodeScenario, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	var (
		out       []geocodeScenario
		current   *geocodeScenario
		inArgs    bool
		awaitArgs bool
		argsLines []string
	)

	s := bufio.NewScanner(f)
	for s.Scan() {
		line := strings.TrimSpace(s.Text())
		switch {
		case line == "", strings.HasPrefix(line, "Feature:"):
			continue
		case strings.HasPrefix(line, "Scenario:"):
			out = append(out, geocodeScenario{name: strings.TrimSpace(strings.TrimPrefix(line, "Scenario:"))})
			current = &out[len(out)-1]
			inArgs = false
			awaitArgs = false
			argsLines = nil
			continue
		case current == nil:
			continue
		}

		if inArgs {
			if line == `"""` {
				argv, err := testruntime.ParseDocstringArgs(argsLines)
				if err != nil {
					return nil, err
				}
				current.argv = argv
				inArgs = false
				argsLines = nil
				continue
			}
			argsLines = append(argsLines, line)
			continue
		}

		if line == `"""` {
			if !awaitArgs {
				return nil, fmt.Errorf("unexpected docstring delimiter in scenario %q", current.name)
			}
			inArgs = true
			awaitArgs = false
			continue
		}

		switch {
		case strings.HasPrefix(line, "Given the Helsinki Moves API geocode response is "):
			fixture, err := parseFixture(strings.TrimPrefix(line, "Given the Helsinki Moves API geocode response is "))
			if err != nil {
				return nil, fmt.Errorf("scenario %q: %w", current.name, err)
			}
			current.fixture = fixture
		case strings.HasPrefix(line, "When the user runs hm with arguments:"):
			awaitArgs = true
		case strings.HasPrefix(line, "Then "):
			check, ok := parseCheck(strings.TrimPrefix(line, "Then "))
			if !ok {
				return nil, fmt.Errorf("unknown Then step in scenario %q: %q", current.name, line)
			}
			current.checks = append(current.checks, check)
		case strings.HasPrefix(line, "And "):
			check, ok := parseCheck(strings.TrimPrefix(line, "And "))
			if !ok {
				return nil, fmt.Errorf("unknown And step in scenario %q: %q", current.name, line)
			}
			current.checks = append(current.checks, check)
		default:
			return nil, fmt.Errorf("unrecognized step in scenario %q: %q", current.name, line)
		}
	}

	if err := s.Err(); err != nil {
		return nil, err
	}
	if inArgs || awaitArgs {
		return nil, fmt.Errorf("scenario %q has an unterminated arguments docstring", current.name)
	}
	return out, nil
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

func runGeocodeScenario(t *testing.T, sc geocodeScenario) {
	t.Helper()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/v1/geocode" {
			http.NotFound(w, r)
			return
		}
		if got, want := r.URL.Query().Get("q"), geocodeQuery(sc.argv); got != want {
			http.Error(w, fmt.Sprintf("unexpected query %q, want %q", got, want), http.StatusBadRequest)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(geocodeResponse(sc.fixture, geocodeQuery(sc.argv)))
	}))
	t.Cleanup(server.Close)

	rt := testruntime.NewRuntime(server.URL)
	got := rt.Run(sc.argv)

	for _, chk := range sc.checks {
		switch chk.kind {
		case "stdout":
			if !strings.Contains(got.Stdout, chk.want) {
				t.Fatalf("stdout missing %q\nstdout: %q", chk.want, got.Stdout)
			}
		case "stderr":
			if !strings.Contains(got.Stderr, chk.want) {
				t.Fatalf("stderr missing %q\nstderr: %q", chk.want, got.Stderr)
			}
		case "code":
			want, err := strconv.Atoi(chk.want)
			if err != nil {
				t.Fatalf("invalid exit code %q: %v", chk.want, err)
			}
			if got.Code != want {
				t.Fatalf("exit code = %d, want %d", got.Code, want)
			}
		default:
			t.Fatalf("unknown check kind %q", chk.kind)
		}
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
			"choices": []any{},
			"location": map[string]any{
				"confidence": 0.95,
				"label":      "Vihdintie 17, Helsinki",
				"latitude":    60.2,
				"longitude":   24.9,
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
