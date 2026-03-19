package bdd_test

import (
	"bufio"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

type readmeScenario struct {
	Name   string
	Checks []readmeCheck
}

type readmeCheck struct {
	Text   string
	Absent bool
}

func TestReadmeCLIContractScenarios(t *testing.T) {
	scenarios, err := loadReadmeScenarios(filepath.Join("readme_cli_contract.scenarios.txt"))
	if err != nil {
		t.Fatal(err)
	}

	section := readmeCLISection(t)

	for _, sc := range scenarios {
		sc := sc
		t.Run(sc.Name, func(t *testing.T) {
			for _, chk := range sc.Checks {
				if chk.Absent {
					if strings.Contains(section, chk.Text) {
						t.Fatalf("CLI section unexpectedly contains %q\nsection: %s", chk.Text, section)
					}
					continue
				}
				if !strings.Contains(section, chk.Text) {
					t.Fatalf("CLI section missing %q\nsection: %s", chk.Text, section)
				}
			}
		})
	}
}

func loadReadmeScenarios(path string) ([]readmeScenario, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	var (
		scenarios []readmeScenario
		current   *readmeScenario
	)

	s := bufio.NewScanner(f)
	for s.Scan() {
		line := strings.TrimSpace(s.Text())
		switch {
		case line == "", strings.HasPrefix(line, "Feature:"):
			continue
		case strings.HasPrefix(line, "Scenario:"):
			scenarios = append(scenarios, readmeScenario{Name: strings.TrimSpace(strings.TrimPrefix(line, "Scenario:"))})
			current = &scenarios[len(scenarios)-1]
		case current == nil:
			continue
		case line == "Given the repository README includes a CLI section", line == "When the CLI section is reviewed":
			continue
		case strings.HasPrefix(line, "Then the CLI section contains "):
			current.Checks = append(current.Checks, readmeCheck{Text: unquoteReadmeStep(strings.TrimPrefix(line, "Then the CLI section contains "))})
		case strings.HasPrefix(line, "And the CLI section contains "):
			current.Checks = append(current.Checks, readmeCheck{Text: unquoteReadmeStep(strings.TrimPrefix(line, "And the CLI section contains "))})
		case strings.HasPrefix(line, "Then the CLI section does not contain "):
			current.Checks = append(current.Checks, readmeCheck{Text: unquoteReadmeStep(strings.TrimPrefix(line, "Then the CLI section does not contain ")), Absent: true})
		case strings.HasPrefix(line, "And the CLI section does not contain "):
			current.Checks = append(current.Checks, readmeCheck{Text: unquoteReadmeStep(strings.TrimPrefix(line, "And the CLI section does not contain ")), Absent: true})
		default:
			return nil, fmt.Errorf("unrecognized step in scenario %q: %q", current.Name, line)
		}
	}

	if err := s.Err(); err != nil {
		return nil, err
	}

	return scenarios, nil
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

func unquoteReadmeStep(text string) string {
	text = strings.TrimSpace(text)
	return strings.Trim(text, "\"`")
}
