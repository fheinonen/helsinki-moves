package testruntime

import "testing"

func TestParseDocstringArgsPreservesQuotedValues(t *testing.T) {
	got, err := ParseDocstringArgs([]string{`-l "Vihdintie 17"`, `--mode tram`})
	if err != nil {
		t.Fatal(err)
	}
	want := []string{"-l", "Vihdintie 17", "--mode", "tram"}
	if len(got) != len(want) {
		t.Fatalf("len(got) = %d, want %d: %#v", len(got), len(want), got)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("got[%d] = %q, want %q", i, got[i], want[i])
		}
	}
}
