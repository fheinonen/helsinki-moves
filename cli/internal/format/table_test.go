package format

import "testing"

func TestSingleModeTable(t *testing.T) {
	rows := []Row{
		{Line: "57", Destination: "Munkkiniemi", Departs: "3 min", Stop: "Vihdintie (Vi0234)"},
		{Line: "58", Destination: "Kamppi", Departs: "15:20", Stop: "Vihdintie (Vi0234)"},
	}

	got := Table(rows, false)
	want := "  LINE  DEST         DEPARTS  STOP              \n  57    Munkkiniemi  3 min    Vihdintie (Vi0234)\n  58    Kamppi       15:20    Vihdintie (Vi0234)\n"
	if got != want {
		t.Fatalf("Table() = %q, want %q", got, want)
	}
}
