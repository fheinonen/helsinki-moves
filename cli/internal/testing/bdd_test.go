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
