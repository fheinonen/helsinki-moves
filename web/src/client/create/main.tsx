import "./styles.css";
import { createBrowserAlertsClient } from "@client/services/alerts-client";
import { bootstrapCreatePage } from "./bootstrap-create-page";
import { createBrowserDeparturesClient } from "@client/services/departures-client";
import { createBrowserGeocodeClient } from "@client/services/geocode-client";
import { createBrowserLocationService } from "@client/services/location-service";
import { createBrowserRoutesClient } from "@client/services/routes-client";
import { createBrowserTravelIntentClient } from "@client/services/travel-intent-client";
import { loadPromptDepartures } from "./load-prompt-departures";

const DEFAULT_COORDS = {
  lat: 60.171,
  lon: 24.9414,
} as const;

const DEFAULT_MODE = "TRAM" as const;

const root = document.querySelector<HTMLElement>("#create-root");

if (!root) {
  throw new Error('Could not find create route root element "#create-root"');
}

const departuresClient = createBrowserDeparturesClient({
  fetchImpl: window.fetch.bind(window),
});
const geocodeClient = createBrowserGeocodeClient({
  fetchImpl: window.fetch.bind(window),
});
const routesClient = createBrowserRoutesClient({
  fetchImpl: window.fetch.bind(window),
});
const alertsClient = createBrowserAlertsClient({
  fetchImpl: window.fetch.bind(window),
});
const locationService = createBrowserLocationService({
  geolocation: navigator.geolocation,
  permissions: navigator.permissions,
});
const travelIntentClient = createBrowserTravelIntentClient({
  fetchImpl: window.fetch.bind(window),
});

void bootstrapCreatePage({
  documentRef: document,
  fetchDepartures: () =>
    departuresClient.getDepartures({
      coords: DEFAULT_COORDS,
      destinations: [],
      lines: [],
      mode: DEFAULT_MODE,
      stopId: null,
    }),
  fetchRoutes: (request) => routesClient.getRoutes(request).then((response) => response.itineraries),
  loadGeneratedDepartures: ({ destinationOverride, onPartial, originOverride, prompt, signal }) =>
    loadPromptDepartures({
      client: departuresClient,
      coords: DEFAULT_COORDS,
      destinationOverride,
      geocodeClient,
      originOverride,
      onPartial,
      prompt,
      signal,
      travelIntentClient,
    }),
  fetchAlerts: (input) => alertsClient.getAlerts(input),
  resolveCurrentLocation: () => locationService.getCurrentPosition(),
  resolveLocationPermission: () => locationService.getPermissionState?.() || Promise.resolve("unavailable"),
  root,
});
