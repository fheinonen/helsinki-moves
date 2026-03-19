package testruntime

import (
	"os"
	"path/filepath"
	"testing"
)

func TestLoadScenariosParsesSharedBDDGlue(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "scenarios.txt")
	if err := os.WriteFile(path, []byte(`Feature: demo

  Scenario: parses steps
    Given the Helsinki Moves API base URL is "http://example.invalid"
    When the user runs hm with arguments:
      """
      -l Kamppi
      """
    Then stdout contains "Kamppi"
    And exit code is 0
`), 0o600); err != nil {
		t.Fatal(err)
	}

	scenarios, err := LoadScenarios(path, func(line string, sc *Scenario) error {
		if line == `Given the Helsinki Moves API base URL is "http://example.invalid"` {
			sc.Values["baseURL"] = "http://example.invalid"
			return nil
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(scenarios) != 1 {
		t.Fatalf("len(scenarios) = %d, want 1", len(scenarios))
	}
	sc := scenarios[0]
	if got := sc.Values["baseURL"]; got != "http://example.invalid" {
		t.Fatalf("baseURL = %q, want %q", got, "http://example.invalid")
	}
	if len(sc.Args) != 2 || sc.Args[0] != "-l" || sc.Args[1] != "Kamppi" {
		t.Fatalf("args = %#v", sc.Args)
	}
	if len(sc.Checks) != 2 {
		t.Fatalf("len(checks) = %d, want 2", len(sc.Checks))
	}
}

func TestLoadScenariosParsesDeparturesChecks(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "scenarios.txt")
	if err := os.WriteFile(path, []byte(`Feature: demo

  Scenario: parses departures checks
    Given the Helsinki Moves API departures fixture is "json departures"
    When the user runs hm with arguments:
      """
      -l Pasila --mode rail --json
      """
    Then stdout is valid JSON
    And the departures API is called 1 time
    And the departures API request has query parameter "mode" set to "RAIL"
    And the first departures API request has query parameter "mode" set to "RAIL"
    And the second departures API request has query parameter "stopId" set to "HSL:2202"
`), 0o600); err != nil {
		t.Fatal(err)
	}

	scenarios, err := LoadScenarios(path, func(line string, sc *Scenario) error {
		if line == `Given the Helsinki Moves API departures fixture is "json departures"` {
			sc.Values["fixture"] = "json departures"
			return nil
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(scenarios) != 1 {
		t.Fatalf("len(scenarios) = %d, want 1", len(scenarios))
	}
	if len(scenarios[0].Checks) != 5 {
		t.Fatalf("len(checks) = %d, want 5", len(scenarios[0].Checks))
	}
}

func TestParseCheckRecognizesDeparturesAssertions(t *testing.T) {
	lines := []string{
		"stdout is valid JSON",
		"the departures API is called 2 times",
		`the departures API request has query parameter "line" set to "57"`,
		`the second departures API request has query parameter "stopId" set to "HSL:2202"`,
	}

	for _, line := range lines {
		line := line
		t.Run(line, func(t *testing.T) {
			check, ok := ParseCheck(line)
			if !ok {
				t.Fatalf("ParseCheck(%q) not recognized", line)
			}
			if check.Kind == "" {
				t.Fatalf("ParseCheck(%q) returned empty kind", line)
			}
		})
	}
}
