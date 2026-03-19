package app

import (
	"fmt"
	"io"
	"net/url"

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
	if _, err := resolveBaseURL(opts.BaseURL); err != nil {
		fmt.Fprintln(stderr, err.Error())
		return exitInvalid
	}

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

	return exitOK
}

func resolveBaseURL(raw string) (string, error) {
	if raw == "" {
		return "https://helsinkimoves.fheinonen.eu", nil
	}
	if _, err := url.ParseRequestURI(raw); err != nil {
		return "", fmt.Errorf("invalid base URL %q", raw)
	}
	return raw, nil
}
