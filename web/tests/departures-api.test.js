const test = require("node:test");
const assert = require("node:assert/strict");

function createMockResponse() {
  return {
    headers: new Map(),
    statusCode: null,
    payload: null,
    setHeader(name, value) {
      this.headers.set(String(name).toLowerCase(), value);
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.payload = body;
      return this;
    },
  };
}

test("departures API ignores non-boardable stop times without returning 500", async (t) => {
  const digitransitPath = require.resolve("../api/lib/digitransit");
  const departuresPath = require.resolve("../api/v1/departures");

  delete require.cache[digitransitPath];
  delete require.cache[departuresPath];

  const digitransit = require(digitransitPath);
  const originalGraphqlRequest = digitransit.graphqlRequest;

  t.after(() => {
    digitransit.graphqlRequest = originalGraphqlRequest;
    delete require.cache[departuresPath];
    delete require.cache[digitransitPath];
  });

  let graphqlCalls = 0;
  digitransit.graphqlRequest = async () => {
    graphqlCalls += 1;

    if (graphqlCalls === 1) {
      return {
        stopsByRadius: {
          edges: [
            {
              node: {
                distance: 60,
                stop: {
                  gtfsId: "HSL:1234",
                  name: "Kamppi",
                  code: "1234",
                  vehicleMode: "BUS",
                  parentStation: null,
                },
              },
            },
          ],
        },
      };
    }

    if (graphqlCalls === 2) {
      const futureServiceDay = Math.floor(Date.now() / 1000) + 120;
      return {
        s0: {
          name: "Kamppi",
          platformCode: "A",
          stoptimesWithoutPatterns: [
            {
              serviceDay: futureServiceDay,
              realtimeDeparture: 0,
              scheduledDeparture: 0,
              pickupType: 0,
              headsign: "Pasila",
              stop: {
                gtfsId: "HSL:1234",
                name: "Kamppi",
                code: "1234",
                platformCode: "A",
              },
              trip: {
                route: {
                  mode: "BUS",
                  shortName: "550",
                },
              },
            },
            {
              serviceDay: futureServiceDay,
              realtimeDeparture: 60,
              scheduledDeparture: 60,
              pickupType: "NONE",
              headsign: "Pasila",
              stop: {
                gtfsId: "HSL:1234",
                name: "Kamppi",
                code: "1234",
                platformCode: "A",
              },
              trip: {
                route: {
                  mode: "BUS",
                  shortName: "550",
                },
              },
            },
          ],
        },
      };
    }

    throw new Error(`Unexpected graphqlRequest call count: ${graphqlCalls}`);
  };

  const handler = require(departuresPath);
  const req = {
    method: "GET",
    query: {
      lat: "60.1708",
      lon: "24.9375",
      mode: "BUS",
    },
  };
  const res = createMockResponse();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.ok(res.payload);
  assert.equal(res.payload.error, undefined);
  assert.equal(res.payload.mode, "BUS");
  assert.equal(res.payload.selectedStopId, "HSL:1234");
  assert.ok(Array.isArray(res.payload.station?.departures));
  assert.equal(res.payload.station.departures.length, 1);
  assert.equal(res.payload.station.departures[0].line, "550");
});
