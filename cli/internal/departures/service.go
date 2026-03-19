package departures

import "hm/internal/api"

type Client interface {
	Geocode(query string) (api.GeocodeResponse, error)
	Departures(params api.DeparturesParams) (api.DeparturesResponse, error)
}

type Service struct {
	client Client
}

type Query struct {
	Text             string
	Mode             string
	Line             string
	Results          string
	UseStopPrecision bool
}

type Result struct {
	Geocode    api.GeocodeResponse
	Departures api.DeparturesResponse
}

func NewService(client Client) Service {
	return Service{client: client}
}

func (s Service) Lookup(query Query) (Result, error) {
	geocode, err := s.client.Geocode(query.Text)
	if err != nil {
		return Result{}, err
	}

	result := Result{Geocode: geocode}
	if geocode.Ambiguous || geocode.Location == nil {
		return result, nil
	}

	result.Departures, err = s.lookupDepartures(*geocode.Location, query)
	if err != nil {
		return Result{}, err
	}
	return result, nil
}

func (s Service) lookupDepartures(location api.GeocodeLocation, query Query) (api.DeparturesResponse, error) {
	first, err := s.client.Departures(s.params(location, query, ""))
	if err != nil || !query.UseStopPrecision || len(first.Stops) == 0 {
		return first, err
	}
	return s.client.Departures(s.params(location, query, first.Stops[0].ID))
}

func (s Service) params(location api.GeocodeLocation, query Query, stopID string) api.DeparturesParams {
	return api.DeparturesParams{
		Lat:     location.Latitude,
		Lon:     location.Longitude,
		Mode:    query.Mode,
		Line:    query.Line,
		Results: query.Results,
		StopID:  stopID,
	}
}
