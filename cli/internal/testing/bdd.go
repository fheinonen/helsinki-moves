package testruntime

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os"
	"regexp"
	"strconv"
	"strings"
	"testing"
)

type Check struct {
	Kind  string
	Want  string
	Count int
	Index int
	Param string
}

type Scenario struct {
	Name   string
	Values map[string]string
	Args   []string
	Checks []Check
}

type HTTPRequest struct {
	Path  string
	Query map[string]string
}

type Evidence struct {
	Result   Result
	Requests []HTTPRequest
}

var departuresCallCountPattern = regexp.MustCompile(`^the departures API is called ([0-9]+) times?$`)
var departuresRequestPattern = regexp.MustCompile(`^the departures API request has query parameter (.+) set to (.+)$`)
var ordinalDeparturesRequestPattern = regexp.MustCompile(`^the (first|second|third) departures API request has query parameter (.+) set to (.+)$`)

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
	case line == "stdout is empty":
		return Check{Kind: "stdout-empty"}, true
	case line == "stderr is empty":
		return Check{Kind: "stderr-empty"}, true
	case line == "stdout is valid JSON":
		return Check{Kind: "stdout-json"}, true
	case strings.HasPrefix(line, "stdout contains "):
		return Check{Kind: "stdout", Want: unquote(strings.TrimPrefix(line, "stdout contains "))}, true
	case strings.HasPrefix(line, "stderr contains "):
		return Check{Kind: "stderr", Want: unquote(strings.TrimPrefix(line, "stderr contains "))}, true
	case strings.HasPrefix(line, "exit code is "):
		return Check{Kind: "code", Want: strings.TrimSpace(strings.TrimPrefix(line, "exit code is "))}, true
	case departuresCallCountPattern.MatchString(line):
		match := departuresCallCountPattern.FindStringSubmatch(line)
		count, err := strconv.Atoi(match[1])
		if err != nil {
			return Check{}, false
		}
		return Check{Kind: "departures-call-count", Count: count}, true
	case departuresRequestPattern.MatchString(line):
		match := departuresRequestPattern.FindStringSubmatch(line)
		return Check{Kind: "departures-request-param", Index: 0, Param: unquote(match[1]), Want: unquote(match[2])}, true
	case ordinalDeparturesRequestPattern.MatchString(line):
		match := ordinalDeparturesRequestPattern.FindStringSubmatch(line)
		index, ok := ordinalIndex(match[1])
		if !ok {
			return Check{}, false
		}
		return Check{Kind: "departures-request-param", Index: index, Param: unquote(match[2]), Want: unquote(match[3])}, true
	default:
		return Check{}, false
	}
}

func RunChecks(t *testing.T, got Result, checks []Check) {
	t.Helper()
	RunChecksWithEvidence(t, Evidence{Result: got}, checks)
}

func RunChecksWithEvidence(t *testing.T, evidence Evidence, checks []Check) {
	t.Helper()

	for _, chk := range checks {
		switch chk.Kind {
		case "stdout-empty":
			if evidence.Result.Stdout != "" {
				t.Fatalf("stdout = %q, want empty", evidence.Result.Stdout)
			}
		case "stderr-empty":
			if evidence.Result.Stderr != "" {
				t.Fatalf("stderr = %q, want empty", evidence.Result.Stderr)
			}
		case "stdout-json":
			if !json.Valid([]byte(strings.TrimSpace(evidence.Result.Stdout))) {
				t.Fatalf("stdout is not valid JSON: %q", evidence.Result.Stdout)
			}
		case "stdout":
			if !strings.Contains(evidence.Result.Stdout, chk.Want) {
				t.Fatalf("stdout missing %q\nstdout: %q", chk.Want, evidence.Result.Stdout)
			}
		case "stderr":
			if !strings.Contains(evidence.Result.Stderr, chk.Want) {
				t.Fatalf("stderr missing %q\nstderr: %q", chk.Want, evidence.Result.Stderr)
			}
		case "code":
			want, err := strconv.Atoi(chk.Want)
			if err != nil {
				t.Fatalf("invalid exit code %q: %v", chk.Want, err)
			}
			if evidence.Result.Code != want {
				t.Fatalf("exit code = %d, want %d", evidence.Result.Code, want)
			}
		case "departures-call-count":
			requests := departuresRequests(evidence.Requests)
			if len(requests) != chk.Count {
				t.Fatalf("departures API calls = %d, want %d", len(requests), chk.Count)
			}
		case "departures-request-param":
			requests := departuresRequests(evidence.Requests)
			if chk.Index >= len(requests) {
				t.Fatalf("departures API request index %d missing; got %d request(s)", chk.Index, len(requests))
			}
			if got := requests[chk.Index].Query[chk.Param]; got != chk.Want {
				t.Fatalf("departures API request %d query parameter %q = %q, want %q", chk.Index+1, chk.Param, got, chk.Want)
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

func ordinalIndex(text string) (int, bool) {
	switch text {
	case "first":
		return 0, true
	case "second":
		return 1, true
	case "third":
		return 2, true
	default:
		return 0, false
	}
}

func departuresRequests(requests []HTTPRequest) []HTTPRequest {
	filtered := make([]HTTPRequest, 0, len(requests))
	for _, request := range requests {
		if request.Path == "/api/v1/departures" {
			filtered = append(filtered, request)
		}
	}
	return filtered
}
