//go:build ci_contract

package bdd_test

import (
	"bytes"
	"errors"
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
			evidence := runCommand(t, repoRoot, sc.Args)
			testruntime.RunChecksWithEvidence(t, evidence, sc.Checks)
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

func runCommand(t *testing.T, dir string, argv []string) testruntime.Evidence {
	t.Helper()

	cmd := exec.Command(argv[0], argv[1:]...)
	cmd.Dir = dir

	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	err := cmd.Run()
	code := 0
	if err != nil {
		var exitErr *exec.ExitError
		if errors.As(err, &exitErr) {
			code = exitErr.ExitCode()
		} else {
			t.Fatalf("wrapper failed: %v", err)
		}
	}

	return testruntime.Evidence{Result: testruntime.Result{Stdout: stdout.String(), Stderr: stderr.String(), Code: code}}
}
