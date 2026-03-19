package app

import (
	"fmt"
	"io"

	"hm/internal/args"
)

const (
	exitOK      = 0
	exitInvalid = 2
)

func Run(argv []string, stdout, stderr io.Writer) int {
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
