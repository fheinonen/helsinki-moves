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
