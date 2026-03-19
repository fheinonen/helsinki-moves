package format

import (
	"fmt"
	"math"
	"time"
)

const relativeThresholdMinutes = 15

func DepartureTime(iso string, now time.Time, loc *time.Location) (string, error) {
	departure, err := time.Parse(time.RFC3339, iso)
	if err != nil {
		return "", err
	}

	diffMinutes := int(math.Round(departure.Sub(now).Minutes()))
	if diffMinutes < 0 {
		return "now", nil
	}
	if diffMinutes < relativeThresholdMinutes {
		return fmt.Sprintf("%d min", diffMinutes), nil
	}
	if loc == nil {
		loc = time.Local
	}
	return departure.In(loc).Format("15:04"), nil
}
