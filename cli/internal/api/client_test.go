package api

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestGeocodeReturnsLocation(t *testing.T) {
	var gotQuery string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotQuery = r.URL.Query().Get("q")
		fmt.Fprint(w, `{"ambiguous":false,"choices":[],"location":{"confidence":0.95,"label":"Kamppi, Helsinki","latitude":60.16,"longitude":24.93},"query":"Kamppi"}`)
	}))
	t.Cleanup(server.Close)

	client := Client{baseURL: server.URL, http: server.Client()}
	resp, err := client.Geocode("Kamppi")
	if err != nil {
		t.Fatal(err)
	}
	if gotQuery != "Kamppi" {
		t.Fatalf("query = %q, want %q", gotQuery, "Kamppi")
	}
	if resp.Location == nil || resp.Location.Label != "Kamppi, Helsinki" {
		t.Fatalf("location = %#v", resp.Location)
	}
}

func TestGeocodeIncludesPlainBodyInAPIError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "Internal Server Error", http.StatusInternalServerError)
	}))
	t.Cleanup(server.Close)

	client := Client{baseURL: server.URL, http: server.Client()}
	_, err := client.Geocode("Kamppi")
	if err == nil {
		t.Fatal("expected error")
	}
	if got := err.Error(); got != "API error (500): Internal Server Error" {
		t.Fatalf("error = %q, want %q", got, "API error (500): Internal Server Error")
	}
}

func TestGeocodeIncludesJSONMessageInAPIError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadGateway)
		fmt.Fprint(w, `{"message":"No route found"}`)
	}))
	t.Cleanup(server.Close)

	client := Client{baseURL: server.URL, http: server.Client()}
	_, err := client.Geocode("Kamppi")
	if err == nil {
		t.Fatal("expected error")
	}
	if got := err.Error(); got != "API error (502): No route found" {
		t.Fatalf("error = %q, want %q", got, "API error (502): No route found")
	}
}
