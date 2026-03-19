package app

import (
	"encoding/json"
	"fmt"
	"io"
	"net/url"
	"strings"
	"time"

	"hm/internal/api"
	"hm/internal/args"
	"hm/internal/departures"
	"hm/internal/format"
)

type Options struct {
	BaseURL  string
	Now      func() time.Time
	Location *time.Location
}

const (
	exitOK       = 0
	exitNotFound = 1
	exitInvalid  = 2
)

func Run(opts Options, argv []string, stdout, stderr io.Writer) int {
	cfg, err := args.Parse(argv)
	if err != nil {
		fmt.Fprintln(stderr, err.Error())
		return exitInvalid
	}

	if cfg.Help {
		fmt.Fprint(stdout, args.HelpText())
		return exitOK
	}

	if cfg.Location == "" && cfg.Stop == "" {
		fmt.Fprintln(stderr, "Missing --location or --stop. Run hm --help for usage.")
		return exitInvalid
	}

	mode := cfg.Mode
	if mode == "" {
		mode = "bus"
	}
	if !args.IsValidMode(mode) {
		fmt.Fprintf(stderr, "Invalid mode %q. Valid: bus, tram, rail, metro\n", mode)
		return exitInvalid
	}

	baseURL, err := resolveBaseURL(opts.BaseURL)
	if err != nil {
		fmt.Fprintln(stderr, err.Error())
		return exitInvalid
	}

	client := api.NewClient(baseURL)
	service := departures.NewService(client)
	if cfg.All {
		return runAllModes(opts, service, cfg, stdout, stderr)
	}
	return runSingleMode(opts, service, cfg, mode, stdout, stderr)
}

func resolveBaseURL(raw string) (string, error) {
	if raw == "" {
		return api.DefaultBaseURL, nil
	}
	if _, err := url.ParseRequestURI(raw); err != nil {
		return "", fmt.Errorf("invalid base URL %q", raw)
	}
	return raw, nil
}

func runSingleMode(opts Options, service departures.Service, cfg args.Config, mode string, stdout, stderr io.Writer) int {
	result, err := service.Lookup(departures.Query{
		Text:             queryText(cfg),
		Mode:             mode,
		Line:             cfg.Line,
		Results:          cfg.Results,
		UseStopPrecision: cfg.Stop != "",
	})
	if err != nil {
		fmt.Fprintf(stderr, "Could not reach Helsinki Moves API. %v\n", err)
		return exitInvalid
	}

	switch {
	case result.Geocode.Ambiguous:
		return writeAmbiguousGeocode(result.Geocode.Query, result.Geocode.Choices, stderr)
	case result.Geocode.Location == nil:
		return writeNoMatchGeocode(result.Geocode.Query, stderr)
	default:
		return writeDepartures(opts, result, mode, cfg.JSON, stdout, stderr)
	}
}

func runAllModes(opts Options, service departures.Service, cfg args.Config, stdout, stderr io.Writer) int {
	result, err := service.LookupAll(departures.Query{
		Text:    queryText(cfg),
		Line:    cfg.Line,
		Results: cfg.Results,
	})
	if err != nil {
		fmt.Fprintf(stderr, "Could not reach Helsinki Moves API. %v\n", err)
		return exitInvalid
	}

	switch {
	case result.Geocode.Ambiguous:
		return writeAmbiguousGeocode(result.Geocode.Query, result.Geocode.Choices, stderr)
	case result.Geocode.Location == nil:
		return writeNoMatchGeocode(result.Geocode.Query, stderr)
	default:
		for _, mode := range result.WarningModes {
			fmt.Fprintf(stderr, "Warning: %s departures unavailable\n", mode)
		}
		return writeAllDepartures(opts, result.Geocode.Location.Label, result.Departures, cfg.JSON, stdout, stderr)
	}
}

func queryText(cfg args.Config) string {
	if cfg.Location != "" {
		return cfg.Location
	}
	return cfg.Stop
}

func writeDepartures(opts Options, result departures.Result, mode string, asJSON bool, stdout, stderr io.Writer) int {
	items := result.Departures.DepartureList()
	if asJSON {
		return writeDeparturesJSON(items, stdout)
	}
	rows, err := departureRows(items, opts.now(), opts.location())
	if err != nil {
		fmt.Fprintf(stderr, "Could not format departures. %v\n", err)
		return exitInvalid
	}
	fmt.Fprintln(stdout, departuresHeading(result.Geocode.Location.Label, result.Departures.StationStopName(), mode))
	if len(rows) > 0 {
		fmt.Fprint(stdout, format.Table(rows, false))
		return exitOK
	}
	fmt.Fprintf(stderr, "No upcoming departures at %s (%s).\n", result.Geocode.Location.Label, mode)
	return exitNotFound
}

func writeDeparturesJSON(items []api.Departure, stdout io.Writer) int {
	data, err := json.Marshal(items)
	if err != nil {
		return exitInvalid
	}
	fmt.Fprintln(stdout, string(data))
	if len(items) == 0 {
		return exitNotFound
	}
	return exitOK
}

func writeAllDepartures(opts Options, label string, items []departures.MergedDeparture, asJSON bool, stdout, stderr io.Writer) int {
	if asJSON {
		return writeAllDeparturesJSON(items, stdout)
	}
	rows, err := allDepartureRows(items, opts.now(), opts.location())
	if err != nil {
		fmt.Fprintf(stderr, "Could not format departures. %v\n", err)
		return exitInvalid
	}
	fmt.Fprintf(stdout, "%s — All departures\n", label)
	if len(rows) > 0 {
		fmt.Fprint(stdout, format.Table(rows, true))
		return exitOK
	}
	fmt.Fprintf(stderr, "No upcoming departures at %s.\n", label)
	return exitNotFound
}

func writeAllDeparturesJSON(items []departures.MergedDeparture, stdout io.Writer) int {
	payload := make([]allDepartureJSON, 0, len(items))
	for _, item := range items {
		payload = append(payload, allDepartureJSON{Departure: item.Departure, Mode: item.Mode})
	}
	data, err := json.Marshal(payload)
	if err != nil {
		return exitInvalid
	}
	fmt.Fprintln(stdout, string(data))
	if len(items) == 0 {
		return exitNotFound
	}
	return exitOK
}

func departureRows(items []api.Departure, now time.Time, loc *time.Location) ([]format.Row, error) {
	rows := make([]format.Row, 0, len(items))
	for _, item := range items {
		departs, err := format.DepartureTime(item.DepartureISO, now, loc)
		if err != nil {
			return nil, err
		}
		rows = append(rows, format.Row{
			Line:        item.Line,
			Destination: item.Destination,
			Departs:     departs,
			Stop:        stopLabel(item),
		})
	}
	return rows, nil
}

func allDepartureRows(items []departures.MergedDeparture, now time.Time, loc *time.Location) ([]format.Row, error) {
	rows := make([]format.Row, 0, len(items))
	for _, item := range items {
		departs, err := format.DepartureTime(item.Departure.DepartureISO, now, loc)
		if err != nil {
			return nil, err
		}
		rows = append(rows, format.Row{
			Mode:        strings.ToUpper(item.Mode),
			Line:        item.Departure.Line,
			Destination: item.Departure.Destination,
			Departs:     departs,
			Stop:        stopLabel(item.Departure),
		})
	}
	return rows, nil
}

type allDepartureJSON struct {
	api.Departure
	Mode string `json:"_mode"`
}

func stopLabel(item api.Departure) string {
	if item.StopCode == "" {
		return item.StopName
	}
	return fmt.Sprintf("%s (%s)", item.StopName, item.StopCode)
}

func departuresHeading(label, stopName, mode string) string {
	if stopName == "" {
		return geocodeHeading(label, mode)
	}
	return fmt.Sprintf("%s — %s — %s departures", label, stopName, title(mode))
}

func writeAmbiguousGeocode(query string, choices []api.GeocodeLocation, stderr io.Writer) int {
	fmt.Fprintf(stderr, "Multiple matches for %q:\n", query)
	for i, choice := range choices {
		conf := ""
		if choice.Confidence != nil {
			conf = fmt.Sprintf(" (%.2f)", *choice.Confidence)
		}
		fmt.Fprintf(stderr, "  %d. %s%s\n", i+1, choice.Label, conf)
	}
	if len(choices) > 0 {
		fmt.Fprintf(stderr, "\nUse a more specific query: hm -l %q\n", choices[0].Label)
	}
	return 1
}

func writeNoMatchGeocode(query string, stderr io.Writer) int {
	fmt.Fprintf(stderr, "No location found for %q. Try a more specific address.\n", query)
	return exitNotFound
}

func writeGeocodeHeading(label, mode string, stdout io.Writer) {
	fmt.Fprintln(stdout, geocodeHeading(label, mode))
}

func geocodeHeading(label, mode string) string {
	return fmt.Sprintf("%s — %s departures", label, title(mode))
}

func title(mode string) string {
	if mode == "" {
		mode = "bus"
	}
	mode = strings.ToUpper(mode[:1]) + mode[1:]
	return mode
}

func (o Options) now() time.Time {
	if o.Now != nil {
		return o.Now()
	}
	return time.Now()
}

func (o Options) location() *time.Location {
	if o.Location != nil {
		return o.Location
	}
	return time.Local
}
