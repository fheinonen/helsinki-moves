package args

import (
	"fmt"
	"strings"
	"unicode"
)

func ParseDocstringArgs(lines []string) ([]string, error) {
	var argv []string
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		tokens, err := parseShellLine(line)
		if err != nil {
			return nil, err
		}
		argv = append(argv, tokens...)
	}
	return argv, nil
}

func parseShellLine(line string) ([]string, error) {
	var (
		tokens  []string
		current strings.Builder
		quote   rune
		escaped bool
		inToken bool
	)

	flush := func() {
		if inToken {
			tokens = append(tokens, current.String())
			current.Reset()
			inToken = false
		}
	}

	for _, r := range line {
		switch {
		case escaped:
			current.WriteRune(r)
			escaped = false
			inToken = true
		case r == '\\':
			escaped = true
		case quote != 0:
			if r == quote {
				quote = 0
				inToken = true
				continue
			}
			current.WriteRune(r)
			inToken = true
		case unicode.IsSpace(r):
			flush()
		case r == '\'' || r == '"':
			quote = r
			inToken = true
		default:
			current.WriteRune(r)
			inToken = true
		}
	}

	if escaped {
		return nil, fmt.Errorf("unterminated escape in %q", line)
	}
	if quote != 0 {
		return nil, fmt.Errorf("unterminated quote in %q", line)
	}
	flush()
	return tokens, nil
}
