package api

type GeocodeLocation struct {
	Confidence *float64 `json:"confidence,omitempty"`
	Label      string   `json:"label"`
	Latitude   float64  `json:"latitude"`
	Longitude  float64  `json:"longitude"`
}

type GeocodeResponse struct {
	Ambiguous bool              `json:"ambiguous"`
	Choices   []GeocodeLocation `json:"choices"`
	Location  *GeocodeLocation  `json:"location"`
	Query     string            `json:"query"`
}

type DeparturesParams struct {
	Lat     float64
	Lon     float64
	Mode    string
	Line    string
	Results string
	StopID  string
}

type Departure struct {
	DepartureISO string  `json:"departureIso"`
	Destination  string  `json:"destination"`
	Line         string  `json:"line"`
	StopCode     string  `json:"stopCode"`
	StopID       string  `json:"stopId"`
	StopName     string  `json:"stopName"`
	Track        *string `json:"track"`
}

type DepartureStation struct {
	Departures     []Departure `json:"departures"`
	DistanceMeters int         `json:"distanceMeters"`
	StopCode       string      `json:"stopCode"`
	StopCodes      []string    `json:"stopCodes"`
	StopName       string      `json:"stopName"`
	Type           string      `json:"type"`
}

type DepartureStop struct {
	Code           string   `json:"code"`
	DistanceMeters int      `json:"distanceMeters"`
	ID             string   `json:"id"`
	MemberStopIDs  []string `json:"memberStopIds"`
	Name           string   `json:"name"`
	StopCodes      []string `json:"stopCodes"`
}

type DeparturesResponse struct {
	Mode           string            `json:"mode"`
	SelectedStopID *string           `json:"selectedStopId"`
	Station        *DepartureStation `json:"station"`
	Stops          []DepartureStop   `json:"stops"`
}

func (r DeparturesResponse) DepartureList() []Departure {
	if r.Station == nil || len(r.Station.Departures) == 0 {
		return []Departure{}
	}
	return r.Station.Departures
}

func (r DeparturesResponse) StationStopName() string {
	if r.Station == nil {
		return ""
	}
	return r.Station.StopName
}
