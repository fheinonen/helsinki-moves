package bdd_test

import (
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"

	testruntime "hm/internal/testing"
)

func TestReadmeCLIContractScenarios(t *testing.T) {
	scenarios, err := testruntime.LoadScenariosWithStepParser(filepath.Join("readme_cli_contract.scenarios.txt"), func(line string, sc *testruntime.Scenario) error {
		switch line {
		case "Given the repository README includes a CLI section":
			sc.Values["readme"] = "README.md"
			return nil
		case "When the CLI section is reviewed":
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
			evidence := testruntime.Evidence{
				Result: testruntime.Result{Stdout: readmeCLISection(t)},
			}
			testruntime.RunChecksWithEvidence(t, evidence, sc.Checks)
		})
	}
}

func readmeCLISection(t *testing.T) string {
	t.Helper()

	body, err := os.ReadFile(filepath.Join(repoRootDirForReadme(t), "README.md"))
	if err != nil {
		t.Fatal(err)
	}

	text := string(body)
	start := strings.Index(text, "\n## CLI\n")
	if start == -1 {
		t.Fatal("README missing ## CLI section")
	}
	start += len("\n## CLI\n")

	rest := text[start:]
	end := strings.Index(rest, "\n## ")
	if end == -1 {
		return strings.TrimSpace(rest)
	}

	return strings.TrimSpace(rest[:end])
}

func repoRootDirForReadme(t *testing.T) string {
	t.Helper()

	_, file, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("runtime.Caller failed")
	}
	return filepath.Clean(filepath.Join(filepath.Dir(file), "..", "..", ".."))
}
