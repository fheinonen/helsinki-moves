const DIGITRANSIT_ENDPOINT = "https://api.digitransit.fi/routing/v2/hsl/gtfs/v1";
const DIGITRANSIT_TIMEOUT_MS = 7000;
const MODE_RAIL = "RAIL";
const MODE_BUS = "BUS";

const nearbyStopsQuery = `
  query NearbyStops($lat: Float!, $lon: Float!, $radius: Int!) {
    stopsByRadius(lat: $lat, lon: $lon, radius: $radius) {
      edges {
        node {
          distance
          stop {
            gtfsId
            name
            code
            vehicleMode
            parentStation {
              gtfsId
              name
            }
          }
        }
      }
    }
  }
`;

const stopDeparturesQuery = `
  query StopDepartures($id: String!, $departures: Int!) {
    stop(id: $id) {
      name
      platformCode
      stoptimesWithoutPatterns(numberOfDepartures: $departures) {
        serviceDay
        scheduledDeparture
        realtimeDeparture
        departureDelay
        headsign
        stop {
          gtfsId
          name
          code
          platformCode
        }
        trip {
          route {
            mode
            shortName
          }
        }
      }
    }
  }
`;

const stationDeparturesQuery = `
  query StationDepartures($id: String!, $departures: Int!) {
    station(id: $id) {
      stoptimesWithoutPatterns(numberOfDepartures: $departures) {
        serviceDay
        scheduledDeparture
        realtimeDeparture
        departureDelay
        headsign
        stop {
          platformCode
        }
        trip {
          route {
            mode
            shortName
          }
        }
      }
    }
  }
`;

async function graphqlRequest(query, variables) {
  const key = process.env.DIGITRANSIT_API_KEY;
  if (!key) {
    throw new Error("Missing DIGITRANSIT_API_KEY environment variable.");
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DIGITRANSIT_TIMEOUT_MS);
  let response;

  try {
    response = await fetch(DIGITRANSIT_ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "digitransit-subscription-key": key,
      },
      body: JSON.stringify({ query, variables }),
      signal: controller.signal,
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error("Digitransit request timed out");
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }

  let json;
  try {
    json = await response.json();
  } catch {
    throw new Error(`Digitransit invalid response (HTTP ${response.status})`);
  }

  if (!response.ok) {
    throw new Error(`Digitransit HTTP ${response.status}`);
  }

  if (json.errors && json.errors.length > 0) {
    throw new Error(json.errors.map((e) => e.message).join(" | "));
  }

  return json.data;
}

module.exports = {
  MODE_RAIL,
  MODE_BUS,
  nearbyStopsQuery,
  stopDeparturesQuery,
  stationDeparturesQuery,
  graphqlRequest,
};
