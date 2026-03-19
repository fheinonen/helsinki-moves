package args

import "fmt"

type Config struct {
	Help     bool
	Location string
	Stop     string
	Mode     string
}

func Parse(argv []string) (Config, error) {
	cfg := Config{}
	for i := 0; i < len(argv); i++ {
		switch argv[i] {
		case "-h", "--help":
			cfg.Help = true
		case "-l", "--location":
			v, ok := nextValue(argv, &i)
			if !ok {
				return Config{}, fmt.Errorf("missing value for %s", argv[i])
			}
			cfg.Location = v
		case "-s", "--stop":
			v, ok := nextValue(argv, &i)
			if !ok {
				return Config{}, fmt.Errorf("missing value for %s", argv[i])
			}
			cfg.Stop = v
		case "-m", "--mode":
			v, ok := nextValue(argv, &i)
			if !ok {
				return Config{}, fmt.Errorf("missing value for %s", argv[i])
			}
			cfg.Mode = v
		default:
			return Config{}, fmt.Errorf("unexpected argument: %q", argv[i])
		}
	}
	return cfg, nil
}

func nextValue(argv []string, i *int) (string, bool) {
	next := *i + 1
	if next >= len(argv) {
		return "", false
	}
	*i = next
	return argv[next], true
}

func IsValidMode(mode string) bool {
	switch mode {
	case "bus", "tram", "rail", "metro":
		return true
	default:
		return false
	}
}
