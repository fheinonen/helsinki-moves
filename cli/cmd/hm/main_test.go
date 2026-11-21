package main

import (
	"bytes"
	"strings"
	"testing"
)

func TestRunUsesEnvironmentBaseURL(t *testing.T) {
	var stdout, stderr bytes.Buffer
	code := run([]string{"-l", "Kamppi"}, ":", &stdout, &stderr)
	if code != 2 {
		t.Fatalf("code = %d, want 2", code)
	}
	if stdout.Len() != 0 {
		t.Fatalf("stdout = %q", stdout.String())
	}
	if !strings.Contains(stderr.String(), "invalid base URL") {
		t.Fatalf("stderr = %q", stderr.String())
	}
}
