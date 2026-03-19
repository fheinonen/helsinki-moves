//go:build ci_contract

package bdd_test

import (
	"fmt"
	"os/exec"
	"path/filepath"
	"runtime"
	"testing"

	testruntime "hm/internal/testing"
)

func TestCIContractScenarios(t *testing.T) {
	scenarios, err := testruntime.LoadScenarios(filepath.Join("ci_contract.scenarios.txt"), func(line string, sc *testruntime.Scenario) error {
		if line == "Given the repository root is the current working tree root" {
			sc.Values["repoRoot"] = "current working tree root"
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
			repoRoot := repoRootDir(t)
			cmd := exec.Command(sc.Args[0], sc.Args[1:]...)
			cmd.Dir = repoRoot
			out, err := cmd.CombinedOutput()
			if err != nil {
				t.Fatalf("wrapper failed: %v\noutput:\n%s", err, out)
			}
			if len(out) != 0 {
				t.Fatalf("output = %q, want empty", out)
			}
		})
	}
}

func repoRootDir(t *testing.T) string {
	t.Helper()

	_, file, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("runtime.Caller failed")
	}
	return filepath.Clean(filepath.Join(filepath.Dir(file), "..", "..", ".."))
}
