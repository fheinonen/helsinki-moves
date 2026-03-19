package bdd_test

import (
	"fmt"
	"path/filepath"
	"strconv"
	"strings"
	"testing"

	testruntime "hm/internal/testing"
)

func TestHelpAndValidationScenarios(t *testing.T) {
	scenarios, err := testruntime.LoadScenarios(filepath.Join("help_and_validation.scenarios.txt"), func(line string, sc *testruntime.Scenario) error {
		if strings.HasPrefix(line, "Given the Helsinki Moves API base URL is ") {
			sc.Values["baseURL"] = unquote(strings.TrimPrefix(line, "Given the Helsinki Moves API base URL is "))
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
			rt := testruntime.NewRuntime(sc.Values["baseURL"])
			got := rt.Run(sc.Args)
			testruntime.RunChecks(t, got, sc.Checks)
		})
	}
}

func unquote(text string) string {
	text = strings.TrimSpace(text)
	if s, err := strconv.Unquote(text); err == nil {
		return s
	}
	return strings.Trim(text, `"`)
}
