package args

const helpText = `hm — Helsinki Moves CLI

Usage: hm [OPTIONS]

Options:
  --location, -l <text>    Address or place name
  --stop, -s <text>        Stop name (precise single-stop results)
  --line, -n <number>      Filter to line(s), comma-separated
  --mode, -m <mode>        Transit mode: bus, tram, rail, metro (default: bus)
  --all, -a                Show all transit modes (overrides --mode)
  --results, -r <count>    Number of departures
  --json                   Output as JSON
  --help, -h               Show this help

Examples:
  hm -l "Vihdintie 17"
  hm -l "Vihdintie 17" --line 57
  hm --stop Talontie
  hm -l Kamppi -m tram
  hm -l Pasila --all
  hm -l Pasila -m rail --json | jq '.[]'
`

func HelpText() string {
	return helpText
}
