package api

type GeocodeLocation struct {
	Confidence *float64 `json:"confidence,omitempty"`
	Label      string    `json:"label"`
	Latitude   float64   `json:"latitude"`
	Longitude  float64   `json:"longitude"`
}

type GeocodeResponse struct {
	Ambiguous bool              `json:"ambiguous"`
	Choices   []GeocodeLocation `json:"choices"`
	Location  *GeocodeLocation  `json:"location"`
	Query     string            `json:"query"`
}
