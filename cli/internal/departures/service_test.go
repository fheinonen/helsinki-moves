package departures

import (
	"errors"
	"testing"

	"hm/internal/api"
)

func TestLookupUsesSingleDeparturesRequestWithoutStopPrecision(t *testing.T) {
	client := &stubClient{
		geocode: api.GeocodeResponse{
			Query: "Kamppi",
			Location: &api.GeocodeLocation{
				Label:     "Kamppi, Helsinki",
				Latitude:  60.17,
				Longitude: 24.94,
			},
		},
		departures: []departuresReply{
			{response: api.DeparturesResponse{Mode: "BUS"}},
		},
	}

	result, err := NewService(client).Lookup(Query{Text: "Kamppi", Mode: "bus", Line: "57", Results: "3"})
	if err != nil {
		t.Fatal(err)
	}
	if result.Geocode.Location == nil || result.Geocode.Location.Label != "Kamppi, Helsinki" {
		t.Fatalf("geocode = %#v", result.Geocode.Location)
	}
	if len(client.departuresCalls) != 1 {
		t.Fatalf("departures calls = %d, want 1", len(client.departuresCalls))
	}
	if got := client.departuresCalls[0]; got.StopID != "" || got.Line != "57" || got.Results != "3" || got.Mode != "bus" {
		t.Fatalf("departures params = %#v", got)
	}
}

func TestLookupReturnsFirstDeparturesResponseWhenStopPrecisionFindsNoStops(t *testing.T) {
	client := &stubClient{
		geocode: api.GeocodeResponse{
			Query: "Talontie",
			Location: &api.GeocodeLocation{
				Label:     "Talontie, Helsinki",
				Latitude:  60.2,
				Longitude: 24.9,
			},
		},
		departures: []departuresReply{
			{response: api.DeparturesResponse{Mode: "BUS", Stops: nil}},
		},
	}

	result, err := NewService(client).Lookup(Query{Text: "Talontie", Mode: "bus", UseStopPrecision: true})
	if err != nil {
		t.Fatal(err)
	}
	if got := result.Departures.Mode; got != "BUS" {
		t.Fatalf("mode = %q, want %q", got, "BUS")
	}
	if len(client.departuresCalls) != 1 {
		t.Fatalf("departures calls = %d, want 1", len(client.departuresCalls))
	}
}

func TestLookupReturnsSecondCallErrorFromStopPrecisionFlow(t *testing.T) {
	client := &stubClient{
		geocode: api.GeocodeResponse{
			Query: "Talontie",
			Location: &api.GeocodeLocation{
				Label:     "Talontie, Helsinki",
				Latitude:  60.2,
				Longitude: 24.9,
			},
		},
		departures: []departuresReply{
			{response: api.DeparturesResponse{Mode: "BUS", Stops: []api.DepartureStop{{ID: "HSL:2202"}}}},
			{err: errors.New("second call failed")},
		},
	}

	_, err := NewService(client).Lookup(Query{Text: "Talontie", Mode: "bus", UseStopPrecision: true})
	if err == nil {
		t.Fatal("expected error")
	}
	if got := err.Error(); got != "second call failed" {
		t.Fatalf("error = %q, want %q", got, "second call failed")
	}
	if len(client.departuresCalls) != 2 {
		t.Fatalf("departures calls = %d, want 2", len(client.departuresCalls))
	}
	if got := client.departuresCalls[1].StopID; got != "HSL:2202" {
		t.Fatalf("second stopId = %q, want %q", got, "HSL:2202")
	}
}

func TestLookupAllSortsMergedDeparturesByDepartureISO(t *testing.T) {
	client := &stubClient{
		geocode: api.GeocodeResponse{
			Query: "Pasila",
			Location: &api.GeocodeLocation{
				Label:     "Pasila, Helsinki",
				Latitude:  60.2,
				Longitude: 24.9,
			},
		},
		departures: []departuresReply{
			{response: departuresResponse("BUS", departuresList(
				departure("2026-03-19T13:07:00Z", "57", "Munkkiniemi"),
			))},
			{response: departuresResponse("TRAM", departuresList(
				departure("2026-03-19T13:03:00Z", "9", "Jatkasaari"),
			))},
			{response: departuresResponse("RAIL", nil)},
			{response: departuresResponse("METRO", nil)},
		},
	}

	result, err := NewService(client).LookupAll(Query{Text: "Pasila", Line: "57", Results: "2", UseStopPrecision: true})
	if err != nil {
		t.Fatal(err)
	}
	if len(client.departuresCalls) != 4 {
		t.Fatalf("departures calls = %d, want 4", len(client.departuresCalls))
	}
	for i, wantMode := range []string{"bus", "tram", "rail", "metro"} {
		if got := client.departuresCalls[i]; got.Mode != wantMode || got.StopID != "" {
			t.Fatalf("departures call %d = %#v, want mode %q with empty stopId", i+1, got, wantMode)
		}
	}
	if len(result.Departures) != 2 {
		t.Fatalf("merged departures = %d, want 2", len(result.Departures))
	}
	if got := result.Departures[0]; got.Mode != "tram" || got.Departure.Line != "9" {
		t.Fatalf("first merged departure = %#v", got)
	}
	if got := result.Departures[1]; got.Mode != "bus" || got.Departure.Line != "57" {
		t.Fatalf("second merged departure = %#v", got)
	}
}

func TestLookupAllReturnsWarningsWhenSomeModesFail(t *testing.T) {
	client := &stubClient{
		geocode: api.GeocodeResponse{
			Query: "Pasila",
			Location: &api.GeocodeLocation{
				Label:     "Pasila, Helsinki",
				Latitude:  60.2,
				Longitude: 24.9,
			},
		},
		departures: []departuresReply{
			{response: departuresResponse("BUS", departuresList(
				departure("2026-03-19T13:03:00Z", "57", "Munkkiniemi"),
			))},
			{err: errors.New("tram unavailable")},
			{response: departuresResponse("RAIL", nil)},
			{response: departuresResponse("METRO", nil)},
		},
	}

	result, err := NewService(client).LookupAll(Query{Text: "Pasila"})
	if err != nil {
		t.Fatal(err)
	}
	if got := result.WarningModes; len(got) != 1 || got[0] != "tram" {
		t.Fatalf("warnings = %#v, want %#v", got, []string{"tram"})
	}
	if len(result.Departures) != 1 {
		t.Fatalf("merged departures = %d, want 1", len(result.Departures))
	}
}

func TestLookupAllReturnsWarningsWhenEveryModeFails(t *testing.T) {
	client := &stubClient{
		geocode: api.GeocodeResponse{
			Query: "Pasila",
			Location: &api.GeocodeLocation{
				Label:     "Pasila, Helsinki",
				Latitude:  60.2,
				Longitude: 24.9,
			},
		},
		departures: []departuresReply{
			{err: errors.New("bus unavailable")},
			{err: errors.New("tram unavailable")},
			{err: errors.New("rail unavailable")},
			{err: errors.New("metro unavailable")},
		},
	}

	result, err := NewService(client).LookupAll(Query{Text: "Pasila"})
	if err != nil {
		t.Fatal(err)
	}
	if got := result.WarningModes; len(got) != 4 {
		t.Fatalf("warnings = %#v, want 4 modes", got)
	}
	if len(result.Departures) != 0 {
		t.Fatalf("merged departures = %d, want 0", len(result.Departures))
	}
}

type stubClient struct {
	geocode         api.GeocodeResponse
	geocodeErr      error
	departures      []departuresReply
	departuresCalls []api.DeparturesParams
}

type departuresReply struct {
	response api.DeparturesResponse
	err      error
}

func (s *stubClient) Geocode(query string) (api.GeocodeResponse, error) {
	return s.geocode, s.geocodeErr
}

func (s *stubClient) Departures(params api.DeparturesParams) (api.DeparturesResponse, error) {
	s.departuresCalls = append(s.departuresCalls, params)
	if len(s.departuresCalls) > len(s.departures) {
		return api.DeparturesResponse{}, errors.New("unexpected departures call")
	}
	reply := s.departures[len(s.departuresCalls)-1]
	return reply.response, reply.err
}

func departuresResponse(mode string, departures []api.Departure) api.DeparturesResponse {
	return api.DeparturesResponse{
		Mode: mode,
		Station: &api.DepartureStation{
			Departures: departures,
			StopCode:   "Pa0001",
			StopCodes:  []string{"Pa0001"},
			StopName:   "Pasilan asema",
			Type:       "station",
		},
		Stops: []api.DepartureStop{
			{Code: "Pa0001", ID: "HSL:9001", Name: "Pasilan asema", StopCodes: []string{"Pa0001"}},
		},
	}
}

func departuresList(items ...api.Departure) []api.Departure {
	return items
}

func departure(iso, line, destination string) api.Departure {
	return api.Departure{
		DepartureISO: iso,
		Line:         line,
		Destination:  destination,
		StopCode:     "Pa0001",
		StopID:       "HSL:9001",
		StopName:     "Pasilan asema",
	}
}
