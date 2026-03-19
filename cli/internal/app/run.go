package app

import (
	"fmt"
	"io"
	"net/url"
	"strings"

	"hm/internal/api"
	"hm/internal/args"
)

type Options struct {
	BaseURL string
}

const (
	exitOK      = 0
	exitInvalid = 2
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

	query := cfg.Location
	if query == "" {
		query = cfg.Stop
	}

	client := api.NewClient(baseURL)
	return runGeocode(client, query, mode, stdout, stderr)
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

func runGeocode(client api.Client, query, mode string, stdout, stderr io.Writer) int {
	result, err := client.Geocode(query)
	if err != nil {
		fmt.Fprintf(stderr, "Could not reach Helsinki Moves API. %v\n", err)
		return exitInvalid
	}

	switch {
	case result.Ambiguous:
		return writeAmbiguousGeocode(query, result.Choices, stderr)
	case result.Location == nil:
		return writeNoMatchGeocode(query, stderr)
	default:
		writeGeocodeHeading(result.Location.Label, mode, stdout)
		return exitOK
	}
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
	return 1
}

func writeGeocodeHeading(label, mode string, stdout io.Writer) {
	fmt.Fprintln(stdout, geocodeHeading(label, mode))
}

func geocodeHeading(label, mode string) string {
	if mode == "" {
		mode = "bus"
	}
	mode = strings.ToUpper(mode[:1]) + mode[1:]
	return fmt.Sprintf("%s — %s departures", label, mode)
}
