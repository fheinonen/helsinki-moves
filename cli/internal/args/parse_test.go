package args

import (
	"strings"
	"testing"
)

func TestParseAcceptsAdvertisedFlags(t *testing.T) {
	cfg, err := Parse([]string{"-l", "Kamppi", "--line", "57", "--all", "--results", "2", "--json", "-m", "bus"})
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Location != "Kamppi" || cfg.Line != "57" || !cfg.All || cfg.Results != "2" || !cfg.JSON || cfg.Mode != "bus" {
		t.Fatalf("unexpected config: %+v", cfg)
	}
}

func TestParseReportsMissingValueForShortFlag(t *testing.T) {
	_, err := Parse([]string{"-l"})
	if err == nil {
		t.Fatal("expected error")
	}
	if !strings.Contains(err.Error(), "-l") {
		t.Fatalf("err = %q", err.Error())
	}
}

func TestParseReportsMissingValueForLongFlag(t *testing.T) {
	_, err := Parse([]string{"--mode"})
	if err == nil {
		t.Fatal("expected error")
	}
	if !strings.Contains(err.Error(), "--mode") {
		t.Fatalf("err = %q", err.Error())
	}
}

func TestParseReportsUnexpectedArgument(t *testing.T) {
	_, err := Parse([]string{"--bogus"})
	if err == nil {
		t.Fatal("expected error")
	}
	if !strings.Contains(err.Error(), "unexpected argument") {
		t.Fatalf("err = %q", err.Error())
	}
}
