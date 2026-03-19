package departures

import (
	"sort"

	"hm/internal/api"
)

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

type MergedDeparture struct {
	Mode      string
	Departure api.Departure
}

type AllResult struct {
	Geocode      api.GeocodeResponse
	Departures   []MergedDeparture
	WarningModes []string
}

var allModes = []string{"bus", "tram", "rail", "metro"}

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

func (s Service) LookupAll(query Query) (AllResult, error) {
	geocode, err := s.client.Geocode(query.Text)
	if err != nil {
		return AllResult{}, err
	}

	result := AllResult{Geocode: geocode}
	if geocode.Ambiguous || geocode.Location == nil {
		return result, nil
	}

	result.Departures, result.WarningModes, err = s.lookupAllDepartures(*geocode.Location, query)
	if err != nil {
		return AllResult{}, err
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

func (s Service) lookupAllDepartures(location api.GeocodeLocation, query Query) ([]MergedDeparture, []string, error) {
	merged := []MergedDeparture{}
	warnings := []string{}
	successes := 0
	var firstErr error

	for _, mode := range allModes {
		resp, err := s.client.Departures(s.params(location, allModesQuery(query, mode), ""))
		if err != nil {
			warnings = append(warnings, mode)
			if firstErr == nil {
				firstErr = err
			}
			continue
		}
		successes++
		merged = append(merged, taggedDepartures(mode, resp.DepartureList())...)
	}

	if successes == 0 && firstErr != nil {
		return nil, nil, firstErr
	}

	sort.Slice(merged, func(i, j int) bool {
		return merged[i].Departure.DepartureISO < merged[j].Departure.DepartureISO
	})
	return merged, warnings, nil
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

func allModesQuery(query Query, mode string) Query {
	query.Mode = mode
	query.UseStopPrecision = false
	return query
}

func taggedDepartures(mode string, items []api.Departure) []MergedDeparture {
	merged := make([]MergedDeparture, 0, len(items))
	for _, item := range items {
		merged = append(merged, MergedDeparture{Mode: mode, Departure: item})
	}
	return merged
}
