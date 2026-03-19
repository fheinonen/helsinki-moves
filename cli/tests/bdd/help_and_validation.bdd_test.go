package bdd_test

import (
	"bufio"
	"os"
	"path/filepath"
	"strings"
	"testing"

	testruntime "hm/internal/testing"
)

type scenario struct {
	name  string
	steps []step
}

type step struct {
	kind string
	text string
}

func TestHelpAndValidationScenarios(t *testing.T) {
	scenarios, err := loadScenarios(filepath.Join("help_and_validation.scenarios.txt"))
	if err != nil {
		t.Fatal(err)
	}

	rt := testruntime.NewRuntime()
	for _, sc := range scenarios {
		t.Run(sc.name, func(t *testing.T) {
			runScenario(t, rt, sc)
		})
	}
}

func loadScenarios(path string) ([]scenario, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	var out []scenario
	var current *scenario
	s := bufio.NewScanner(f)
	for s.Scan() {
		line := strings.TrimSpace(s.Text())
		if line == "" || strings.HasPrefix(line, "Feature:") {
			continue
		}
		if strings.HasPrefix(line, "Scenario:") {
			out = append(out, scenario{name: strings.TrimSpace(strings.TrimPrefix(line, "Scenario:"))})
			current = &out[len(out)-1]
			continue
		}
		if current == nil {
			continue
		}
		kind, text, ok := splitStep(line)
		if !ok {
			continue
		}
		current.steps = append(current.steps, step{kind: kind, text: text})
	}
	if err := s.Err(); err != nil {
		return nil, err
	}
	return out, nil
}

func splitStep(line string) (kind, text string, ok bool) {
	for _, prefix := range []string{"Given ", "When ", "Then ", "And "} {
		if strings.HasPrefix(line, prefix) {
			return strings.TrimSuffix(prefix, " "), strings.TrimSpace(strings.TrimPrefix(line, prefix)), true
		}
	}
	return "", "", false
}

func runScenario(t *testing.T, rt *testruntime.Runtime, sc scenario) {
	t.Helper()

	args := parseArgs(t, sc)
	var got testruntime.Result
	hasRun := false

	for _, st := range sc.steps {
		switch st.kind {
		case "When":
			if hasRun {
				t.Fatalf("scenario %q runs the CLI more than once", sc.name)
			}
			got = rt.Run(args)
			hasRun = true
		case "Then", "And":
			if !hasRun {
				t.Fatalf("scenario %q asserts before the CLI runs", sc.name)
			}
			assertStep(t, got, st)
		}
	}
	if !hasRun {
		t.Fatalf("scenario %q never runs the CLI", sc.name)
	}
}

func parseArgs(t *testing.T, sc scenario) []string {
	t.Helper()
	for _, st := range sc.steps {
		if st.kind == "Given" {
			return extractArgs(t, st.text)
		}
	}
	t.Fatalf("scenario %q is missing a Given step", sc.name)
	return nil
}

func extractArgs(t *testing.T, text string) []string {
	t.Helper()
	start := strings.Index(text, "`")
	end := strings.LastIndex(text, "`")
	if start == -1 || end <= start {
		t.Fatalf("invalid command step: %q", text)
	}
	command := strings.TrimSpace(text[start+1 : end])
	return strings.Fields(command)[1:]
}

func assertStep(t *testing.T, got testruntime.Result, st step) {
	t.Helper()
	switch {
	case strings.HasPrefix(st.text, "stdout contains "):
		want := unquote(st.text, "stdout contains ")
		if !strings.Contains(got.Stdout, want) {
			t.Fatalf("stdout missing %q\nstdout: %q", want, got.Stdout)
		}
	case strings.HasPrefix(st.text, "stderr contains "):
		want := unquote(st.text, "stderr contains ")
		if !strings.Contains(got.Stderr, want) {
			t.Fatalf("stderr missing %q\nstderr: %q", want, got.Stderr)
		}
	case strings.HasPrefix(st.text, "exit code is "):
		want := unquote(st.text, "exit code is ")
		if got.Code != mustAtoi(t, want) {
			t.Fatalf("exit code = %d, want %s", got.Code, want)
		}
	default:
		t.Fatalf("unknown step: %q", st.text)
	}
}

func unquote(text, prefix string) string {
	return strings.Trim(strings.TrimPrefix(text, prefix), "`")
}

func mustAtoi(t *testing.T, s string) int {
	t.Helper()
	var n int
	for _, r := range s {
		if r < '0' || r > '9' {
			t.Fatalf("invalid integer %q", s)
		}
		n = n*10 + int(r-'0')
	}
	return n
}
