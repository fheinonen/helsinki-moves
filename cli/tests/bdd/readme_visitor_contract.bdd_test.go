package bdd_test

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"

	testruntime "hm/internal/testing"
)

func TestReadmeVisitorContractScenarios(t *testing.T) {
	scenarios, err := testruntime.LoadScenariosWithStepParser(filepath.Join("readme_visitor_contract.scenarios.txt"), func(line string, sc *testruntime.Scenario) error {
		switch line {
		case "Given the repository README is on disk":
			return readRepositoryReadme(t, sc)
		case "When the text before the setup guide is taken":
			return takeVisitorReadme(sc)
		default:
			return fmt.Errorf("unrecognized step in scenario %q: %q", sc.Name, line)
		}
	})
	if err != nil {
		t.Fatal(err)
	}

	for _, sc := range scenarios {
		sc := sc
		t.Run(sc.Name, func(t *testing.T) {
			evidence := testruntime.Evidence{
				Result: testruntime.Result{Stdout: sc.Values["visitor"]},
			}
			testruntime.RunChecksWithEvidence(t, evidence, sc.Checks)
		})
	}
}

func readRepositoryReadme(t *testing.T, sc *testruntime.Scenario) error {
	t.Helper()

	body, err := os.ReadFile(filepath.Join(repoRootDirForReadme(t), "README.md"))
	if err != nil {
		return err
	}
	sc.Values["readme"] = string(body)
	return nil
}

func takeVisitorReadme(sc *testruntime.Scenario) error {
	visitor, err := visitorSectionBeforeSetup(sc.Values["readme"])
	if err != nil {
		return err
	}
	sc.Values["visitor"] = visitor
	return nil
}

func visitorSectionBeforeSetup(body string) (string, error) {
	const setup = "\n## Run a copy\n"
	cut := strings.Index(body, setup)
	if cut < 0 {
		return "", fmt.Errorf("README has no setup guide heading")
	}
	visitor := body[:cut]
	urlAt := strings.Index(visitor, "https://helsinkimoves.fheinonen.eu")
	phoneAt := strings.Index(visitor, "\n## On your phone\n")
	if urlAt < 0 || phoneAt < 0 || urlAt > phoneAt {
		return "", fmt.Errorf("production URL does not lead the page")
	}
	return strings.TrimSpace(visitor), nil
}
