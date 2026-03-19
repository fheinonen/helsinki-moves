package testruntime

import (
	"bufio"
	"fmt"
	"os"
	"strconv"
	"strings"
	"testing"
)

type Check struct {
	Kind string
	Want string
}

type Scenario struct {
	Name   string
	Values map[string]string
	Args   []string
	Checks []Check
}

func LoadScenarios(path string, parseGiven func(string, *Scenario) error) ([]Scenario, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	var (
		out       []Scenario
		current   *Scenario
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
			out = append(out, Scenario{Name: strings.TrimSpace(strings.TrimPrefix(line, "Scenario:")), Values: map[string]string{}})
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
				argv, err := ParseDocstringArgs(argsLines)
				if err != nil {
					return nil, err
				}
				current.Args = argv
				inArgs = false
				argsLines = nil
				continue
			}
			argsLines = append(argsLines, line)
			continue
		}

		if line == `"""` {
			if !awaitArgs {
				return nil, fmt.Errorf("unexpected docstring delimiter in scenario %q", current.Name)
			}
			inArgs = true
			awaitArgs = false
			continue
		}

		switch {
		case strings.HasPrefix(line, "Given "):
			if parseGiven == nil {
				return nil, fmt.Errorf("unexpected Given step in scenario %q: %q", current.Name, line)
			}
			if err := parseGiven(line, current); err != nil {
				return nil, err
			}
		case strings.HasPrefix(line, "When the user runs hm with arguments:"):
			awaitArgs = true
		case strings.HasPrefix(line, "Then "):
			check, ok := ParseCheck(strings.TrimPrefix(line, "Then "))
			if !ok {
				return nil, fmt.Errorf("unknown Then step in scenario %q: %q", current.Name, line)
			}
			current.Checks = append(current.Checks, check)
		case strings.HasPrefix(line, "And "):
			check, ok := ParseCheck(strings.TrimPrefix(line, "And "))
			if !ok {
				return nil, fmt.Errorf("unknown And step in scenario %q: %q", current.Name, line)
			}
			current.Checks = append(current.Checks, check)
		default:
			return nil, fmt.Errorf("unrecognized step in scenario %q: %q", current.Name, line)
		}
	}

	if err := s.Err(); err != nil {
		return nil, err
	}
	if inArgs || awaitArgs {
		return nil, fmt.Errorf("scenario %q has an unterminated arguments docstring", current.Name)
	}
	return out, nil
}

func ParseCheck(line string) (Check, bool) {
	switch {
	case strings.HasPrefix(line, "stdout contains "):
		return Check{Kind: "stdout", Want: unquote(strings.TrimPrefix(line, "stdout contains "))}, true
	case strings.HasPrefix(line, "stderr contains "):
		return Check{Kind: "stderr", Want: unquote(strings.TrimPrefix(line, "stderr contains "))}, true
	case strings.HasPrefix(line, "exit code is "):
		return Check{Kind: "code", Want: strings.TrimSpace(strings.TrimPrefix(line, "exit code is "))}, true
	default:
		return Check{}, false
	}
}

func RunChecks(t *testing.T, got Result, checks []Check) {
	t.Helper()

	for _, chk := range checks {
		switch chk.Kind {
		case "stdout":
			if !strings.Contains(got.Stdout, chk.Want) {
				t.Fatalf("stdout missing %q\nstdout: %q", chk.Want, got.Stdout)
			}
		case "stderr":
			if !strings.Contains(got.Stderr, chk.Want) {
				t.Fatalf("stderr missing %q\nstderr: %q", chk.Want, got.Stderr)
			}
		case "code":
			want, err := strconv.Atoi(chk.Want)
			if err != nil {
				t.Fatalf("invalid exit code %q: %v", chk.Want, err)
			}
			if got.Code != want {
				t.Fatalf("exit code = %d, want %d", got.Code, want)
			}
		default:
			t.Fatalf("unknown check kind %q", chk.Kind)
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
