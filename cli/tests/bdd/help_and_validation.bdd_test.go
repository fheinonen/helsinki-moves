package bdd_test

import (
	"bufio"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"

	testruntime "hm/internal/testing"
)

type scenario struct {
	name    string
	baseURL string
	argv    []string
	checks  []check
}

type check struct {
	kind string
	want string
}

func TestHelpAndValidationScenarios(t *testing.T) {
	scenarios, err := loadScenarios(filepath.Join("help_and_validation.scenarios.txt"))
	if err != nil {
		t.Fatal(err)
	}

	for _, sc := range scenarios {
		sc := sc
		t.Run(sc.name, func(t *testing.T) {
			runScenario(t, sc)
		})
	}
}

func loadScenarios(path string) ([]scenario, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	var (
		out       []scenario
		current   *scenario
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
			out = append(out, scenario{name: strings.TrimSpace(strings.TrimPrefix(line, "Scenario:"))})
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
		case strings.HasPrefix(line, "Given the Helsinki Moves API base URL is "):
			current.baseURL = unquote(strings.TrimPrefix(line, "Given the Helsinki Moves API base URL is "))
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

func parseCheck(line string) (check, bool) {
	switch {
	case strings.HasPrefix(line, "stdout contains "):
		return check{kind: "stdout", want: unquote(strings.TrimPrefix(line, "stdout contains "))}, true
	case strings.HasPrefix(line, "stderr contains "):
		return check{kind: "stderr", want: unquote(strings.TrimPrefix(line, "stderr contains "))}, true
	case strings.HasPrefix(line, "exit code is "):
		return check{kind: "code", want: strings.TrimSpace(strings.TrimPrefix(line, "exit code is "))}, true
	default:
		return check{}, false
	}
}

func runScenario(t *testing.T, sc scenario) {
	t.Helper()

	rt := testruntime.NewRuntime(sc.baseURL)
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

func unquote(text string) string {
	text = strings.TrimSpace(text)
	if s, err := strconv.Unquote(text); err == nil {
		return s
	}
	return strings.Trim(text, `"`)
}
