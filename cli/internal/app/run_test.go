package app

import (
	"bytes"
	"strings"
	"testing"
)

func TestRunRejectsInvalidBaseURL(t *testing.T) {
	var stdout, stderr bytes.Buffer
	code := Run(Options{BaseURL: ":"}, []string{"-l", "Kamppi", "-m", "bus"}, &stdout, &stderr)
	if code != 2 {
		t.Fatalf("code = %d, want 2", code)
	}
	if !strings.Contains(stderr.String(), "invalid base URL") {
		t.Fatalf("stderr = %q", stderr.String())
	}
}

func TestRunHelpIgnoresInvalidBaseURL(t *testing.T) {
	var stdout, stderr bytes.Buffer
	code := Run(Options{BaseURL: ":"}, []string{"--help"}, &stdout, &stderr)
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
