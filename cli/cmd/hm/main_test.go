package main

import (
	"bytes"
	"strings"
	"testing"
)

func TestRunUsesEnvironmentBaseURL(t *testing.T) {
	var stdout, stderr bytes.Buffer
	code := run([]string{"--help"}, "http://example.invalid", &stdout, &stderr)
	if code != 0 {
		t.Fatalf("code = %d, want 0", code)
	}
	if stderr.Len() != 0 {
		t.Fatalf("stderr = %q", stderr.String())
	}
	if !strings.Contains(stdout.String(), "Helsinki Moves CLI") {
		t.Fatalf("stdout = %q", stdout.String())
	}
}
