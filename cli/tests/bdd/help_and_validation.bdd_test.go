package bdd_test

import (
	"path/filepath"
	"testing"

	testruntime "hm/internal/testing"
)

func TestHelpAndValidationScenarios(t *testing.T) {
	scenarios, err := testruntime.LoadScenarios(filepath.Join("help_and_validation.scenarios.txt"), nil)
	if err != nil {
		t.Fatal(err)
	}

	for _, sc := range scenarios {
		sc := sc
		t.Run(sc.Name, func(t *testing.T) {
			rt := testruntime.NewRuntime("http://127.0.0.1:1")
			got := rt.Run(sc.Args)
			testruntime.RunChecks(t, got, sc.Checks)
		})
	}
}
