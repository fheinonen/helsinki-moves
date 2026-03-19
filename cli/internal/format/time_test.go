package format

import (
	"testing"
	"time"
)

func TestFormatDepartureTime(t *testing.T) {
	now := time.Date(2026, time.March, 19, 15, 0, 0, 0, time.FixedZone("EET", 2*60*60))

	tests := []struct {
		name string
		iso  string
		want string
	}{
		{name: "past departures show now", iso: "2026-03-19T12:59:00Z", want: "now"},
		{name: "departures under fifteen minutes stay relative", iso: "2026-03-19T13:03:00Z", want: "3 min"},
		{name: "fifteen minute departures switch to wall clock time", iso: "2026-03-19T13:15:00Z", want: "15:15"},
	}

	for _, tt := range tests {
		tt := tt
		t.Run(tt.name, func(t *testing.T) {
			got, err := DepartureTime(tt.iso, now, now.Location())
			if err != nil {
				t.Fatal(err)
			}
			if got != tt.want {
				t.Fatalf("DepartureTime(%q) = %q, want %q", tt.iso, got, tt.want)
			}
		})
	}
}
