const test = require("node:test");
const assert = require("node:assert/strict");

const { defineFeature } = require("./helpers/bdd");
const departuresApi = require("../api/v1/departures")._private;

function createModeStop(id, mode, distance, name = "Stop", code = "1001") {
  return {
    distance,
    stop: {
      gtfsId: id,
      vehicleMode: mode,
      name,
      code,
      parentStation: null,
    },
  };
}

const featureText = `
Feature: Extra departures API helper branch coverage

Scenario: BUS default result limit is 24
  Given default limit mode "BUS"
  When default limit helper runs
  Then default limit equals 24

Scenario: Bus no-nearby message is bus specific
  Given no-nearby message mode "BUS"
  When no-nearby message helper runs
  Then no-nearby message helper output equals "No nearby bus stops"

Scenario: Rail no-nearby message is rail specific
  Given no-nearby message mode "RAIL"
  When no-nearby message helper runs
  Then no-nearby message helper output equals "No nearby train stations"

Scenario: BUS mode is recognized as stop mode
  Given stop-mode mode "BUS"
  When stop-mode helper runs
  Then stop-mode helper output equals true

Scenario: Unsupported mode is not recognized as stop mode
  Given stop-mode mode "FERRY"
  When stop-mode helper runs
  Then stop-mode helper output equals false

Scenario: Requested stop can match member stop id
  Given selectable stop groups with member ids
  And requested stop id "HSL:member-2"
  When requested stop helper runs
  Then selected stop helper id equals "HSL:group"

Scenario: Parse departures request trims stopId and keeps defaults
  Given departures query with valid coordinates and stopId padding
  When departures request helper runs
  Then departures request helper has no error
  And parsed requested stop id equals "HSL:group"

Scenario: Destination-only filtering keeps matching departures
  Given departures list with mixed destinations
  And destination filters "Kamppi"
  When departures filter helper runs
  Then departures filter result count equals 2

Scenario: Selectable stop builder caps grouped results to eight stops
  Given nine unique nearby stops
  When selectable stop builder runs
  Then selectable stop builder output count equals 8

Scenario: Mode stop selector ignores stops without gtfs id
  Given nearby data with one missing stop id and one valid bus stop
  When mode stop selector runs for mode "BUS"
  Then mode stop selector count equals 1

Scenario: Parse departures request accepts line intent keyword flag
  Given departures query with line-intent keyword flag
  When departures request helper runs
  Then departures request helper has no error
  And parsed line-intent flag equals true

Scenario: Parse departures request keeps line intent false by default
  Given departures query with valid coordinates and stopId padding
  When departures request helper runs
  Then departures request helper has no error
  And parsed line-intent flag equals false

Scenario: Parse departures request accepts line intent boolean flag
  Given departures query with line-intent boolean flag
  When departures request helper runs
  Then departures request helper has no error
  And parsed line-intent flag equals true

Scenario: Parse departures request accepts numeric line intent flag
  Given departures query with line-intent numeric flag
  When departures request helper runs
  Then departures request helper has no error
  And parsed line-intent flag equals true

Scenario: Parse departures request rejects invalid mode
  Given departures query with invalid mode
  When departures request helper runs
  Then departures request helper error equals "Invalid mode"

Scenario: Parse departures request rejects invalid results
  Given departures query with invalid results
  When departures request helper runs
  Then departures request helper error equals "Invalid results"

Scenario: Line-intent no-nearby message falls back to generic line label
  Given line-intent no-nearby message mode "BUS" and empty line token
  When line-intent no-nearby message helper runs
  Then line-intent no-nearby message equals "No nearby departures found for bus line."

Scenario: Line-intent no-nearby message uses rail mode label
  Given line-intent no-nearby message mode "RAIL" with line token "A"
  When line-intent no-nearby message helper runs
  Then line-intent no-nearby message equals "No nearby departures found for rail A."

Scenario: Line matching helper detects matching requested line
  Given departures list with lines "15|67"
  And requested line filters "67"
  When line matching helper runs
  Then line matching helper output equals true

Scenario: Line matching helper returns false with empty requested lines
  Given departures list with lines "15|67"
  And requested line filters ""
  When line matching helper runs
  Then line matching helper output equals false

Scenario: Line-intent stop selection returns null when no stop matches the requested line
  Given line-intent stop selection input with no matching lines
  When line-intent stop selection helper runs
  Then line-intent stop selection is null

Scenario: Line-intent stop selection falls back to stop id when member stop ids are missing
  Given line-intent stop selection input without member stop ids
  When line-intent stop selection helper runs
  Then line-intent stop selection helper id equals "HSL:solo"
`;

defineFeature(test, featureText, {
  createWorld: () => ({
    input: {},
    output: null,
  }),
  stepDefinitions: [
    {
      pattern: /^Given default limit mode "([^"]*)"$/,
      run: ({ args, world }) => {
        world.input.mode = args[0];
      },
    },
    {
      pattern: /^When default limit helper runs$/,
      run: ({ world }) => {
        world.output = departuresApi.getDefaultResultLimit(world.input.mode);
      },
    },
    {
      pattern: /^Then default limit equals (\d+)$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.output, Number(args[0]));
      },
    },
    {
      pattern: /^Given no-nearby message mode "([^"]*)"$/,
      run: ({ args, world }) => {
        world.input.mode = args[0];
      },
    },
    {
      pattern: /^When no-nearby message helper runs$/,
      run: ({ world }) => {
        world.output = departuresApi.getNoNearbyStopsMessage(world.input.mode);
      },
    },
    {
      pattern: /^Then no-nearby message helper output equals "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.output, args[0]);
      },
    },
    {
      pattern: /^Given stop-mode mode "([^"]*)"$/,
      run: ({ args, world }) => {
        world.input.mode = args[0];
      },
    },
    {
      pattern: /^When stop-mode helper runs$/,
      run: ({ world }) => {
        world.output = departuresApi.isStopMode(world.input.mode);
      },
    },
    {
      pattern: /^Then stop-mode helper output equals (true|false)$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.output, args[0] === "true");
      },
    },
    {
      pattern: /^Given selectable stop groups with member ids$/,
      run: ({ world }) => {
        world.input.stops = [
          { id: "HSL:group", memberStopIds: ["HSL:member-1", "HSL:member-2"] },
          { id: "HSL:other", memberStopIds: ["HSL:other"] },
        ];
      },
    },
    {
      pattern: /^Given requested stop id "([^"]*)"$/,
      run: ({ args, world }) => {
        world.input.requestedStopId = args[0];
      },
    },
    {
      pattern: /^When requested stop helper runs$/,
      run: ({ world }) => {
        world.output = departuresApi.selectRequestedStop(world.input.stops, world.input.requestedStopId);
      },
    },
    {
      pattern: /^Then selected stop helper id equals "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.output?.id, args[0]);
      },
    },
    {
      pattern: /^Given departures query with valid coordinates and stopId padding$/,
      run: ({ world }) => {
        world.input.query = {
          lat: "60.17",
          lon: "24.93",
          mode: "BUS",
          stopId: "  HSL:group  ",
        };
      },
    },
    {
      pattern: /^When departures request helper runs$/,
      run: ({ world }) => {
        world.output = departuresApi.parseDeparturesRequest(world.input.query);
      },
    },
    {
      pattern: /^Then departures request helper has no error$/,
      run: ({ assert, world }) => {
        assert.equal(world.output?.error, null);
      },
    },
    {
      pattern: /^Then departures request helper error equals "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.output?.error, args[0]);
      },
    },
    {
      pattern: /^Then parsed requested stop id equals "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.output?.params?.requestedStopId, args[0]);
      },
    },
    {
      pattern: /^Given departures list with mixed destinations$/,
      run: ({ world }) => {
        world.input.departures = [
          { line: "550", destination: "Kamppi" },
          { line: "551", destination: "Kamppi" },
          { line: "560", destination: "Pasila" },
        ];
        world.input.lines = [];
      },
    },
    {
      pattern: /^Given destination filters "([^"]*)"$/,
      run: ({ args, world }) => {
        world.input.destinations = args[0] ? args[0].split("|") : [];
      },
    },
    {
      pattern: /^When departures filter helper runs$/,
      run: ({ world }) => {
        world.output = departuresApi.filterDeparturesBySelections(
          world.input.departures,
          world.input.lines,
          world.input.destinations
        );
      },
    },
    {
      pattern: /^Then departures filter result count equals (\d+)$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.output.length, Number(args[0]));
      },
    },
    {
      pattern: /^Given nine unique nearby stops$/,
      run: ({ world }) => {
        world.input.modeStops = Array.from({ length: 9 }, (_, index) =>
          createModeStop(`HSL:${index + 1}`, "BUS", index + 10, `Stop ${index + 1}`, `${index + 1}`)
        );
      },
    },
    {
      pattern: /^When selectable stop builder runs$/,
      run: ({ world }) => {
        world.output = departuresApi.buildSelectableStops(world.input.modeStops);
      },
    },
    {
      pattern: /^Then selectable stop builder output count equals (\d+)$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.output.length, Number(args[0]));
      },
    },
    {
      pattern: /^Given nearby data with one missing stop id and one valid bus stop$/,
      run: ({ world }) => {
        world.input.nearbyData = {
          stopsByRadius: {
            edges: [
              { node: { distance: 20, stop: { gtfsId: "", vehicleMode: "BUS" } } },
              { node: { distance: 10, stop: { gtfsId: "HSL:1", vehicleMode: "BUS" } } },
            ],
          },
        };
      },
    },
    {
      pattern: /^When mode stop selector runs for mode "([^"]*)"$/,
      run: ({ args, world }) => {
        world.output = departuresApi.getModeStops(world.input.nearbyData, args[0]);
      },
    },
    {
      pattern: /^Then mode stop selector count equals (\d+)$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.output.length, Number(args[0]));
      },
    },
    {
      pattern: /^Given departures query with line-intent keyword flag$/,
      run: ({ world }) => {
        world.input.query = {
          lat: "60.17",
          lon: "24.93",
          mode: "BUS",
          line: "67",
          intent: "line",
        };
      },
    },
    {
      pattern: /^Then parsed line-intent flag equals (true|false)$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.output?.params?.lineIntentRequested, args[0] === "true");
      },
    },
    {
      pattern: /^Given departures query with line-intent boolean flag$/,
      run: ({ world }) => {
        world.input.query = {
          lat: "60.17",
          lon: "24.93",
          mode: "BUS",
          line: "67",
          lineIntent: "true",
        };
      },
    },
    {
      pattern: /^Given departures query with line-intent numeric flag$/,
      run: ({ world }) => {
        world.input.query = {
          lat: "60.17",
          lon: "24.93",
          mode: "BUS",
          line: "67",
          lineIntent: "1",
        };
      },
    },
    {
      pattern: /^Given departures query with invalid mode$/,
      run: ({ world }) => {
        world.input.query = {
          lat: "60.17",
          lon: "24.93",
          mode: "FERRY",
        };
      },
    },
    {
      pattern: /^Given departures query with invalid results$/,
      run: ({ world }) => {
        world.input.query = {
          lat: "60.17",
          lon: "24.93",
          mode: "BUS",
          results: "999",
        };
      },
    },
    {
      pattern: /^Given line-intent no-nearby message mode "([^"]*)" and empty line token$/,
      run: ({ args, world }) => {
        world.input.mode = args[0];
        world.input.requestedLines = [""];
      },
    },
    {
      pattern: /^Given line-intent no-nearby message mode "([^"]*)" with line token "([^"]*)"$/,
      run: ({ args, world }) => {
        world.input.mode = args[0];
        world.input.requestedLines = [args[1]];
      },
    },
    {
      pattern: /^When line-intent no-nearby message helper runs$/,
      run: ({ world }) => {
        world.output = departuresApi.buildNoNearbyLineIntentMessage(
          world.input.mode,
          world.input.requestedLines
        );
      },
    },
    {
      pattern: /^Then line-intent no-nearby message equals "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.output, args[0]);
      },
    },
    {
      pattern: /^Given departures list with lines "([^"]*)"$/,
      run: ({ args, world }) => {
        world.input.departures = args[0].split("|").map((line) => ({ line }));
      },
    },
    {
      pattern: /^Given requested line filters "([^"]*)"$/,
      run: ({ args, world }) => {
        world.input.requestedLines = args[0] ? args[0].split("|") : [];
      },
    },
    {
      pattern: /^When line matching helper runs$/,
      run: ({ world }) => {
        world.output = departuresApi.hasAnyMatchingLine(
          world.input.departures,
          world.input.requestedLines
        );
      },
    },
    {
      pattern: /^Then line matching helper output equals (true|false)$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.output, args[0] === "true");
      },
    },
    {
      pattern: /^Given line-intent stop selection input with no matching lines$/,
      run: ({ world }) => {
        world.input.lineIntentStopSelection = {
          graphqlCalls: 0,
          stops: [
            { id: "HSL:1", memberStopIds: ["HSL:1"] },
            { id: "HSL:2", memberStopIds: ["HSL:2"] },
          ],
          requestedLines: ["67"],
        };
      },
    },
    {
      pattern: /^Given line-intent stop selection input without member stop ids$/,
      run: ({ world }) => {
        world.input.lineIntentStopSelection = {
          graphqlCalls: 0,
          stops: [{ id: "HSL:solo" }],
          requestedLines: ["67"],
        };
      },
    },
    {
      pattern: /^When line-intent stop selection helper runs$/,
      run: async ({ world }) => {
        world.output = await departuresApi.selectLineIntentStop({
          graphqlRequest: async () => {
            world.input.lineIntentStopSelection.graphqlCalls += 1;
            if ((world.input.lineIntentStopSelection.stops || []).length === 1) {
              return {
                s0: {
                  platformCode: "1",
                  stoptimesWithoutPatterns: [
                    {
                      serviceDay: Math.floor(Date.now() / 1000) + 3600,
                      scheduledDeparture: 0,
                      realtimeDeparture: 0,
                      realtime: false,
                      pickupType: 0,
                      stop: { gtfsId: "HSL:solo", platformCode: "1" },
                      trip: {
                        route: { shortName: "67", longName: "Pasila", mode: "BUS" },
                      },
                      headsign: "Pasila",
                    },
                  ],
                },
              };
            }
            return {
              s0: {
                platformCode: "1",
                stoptimesWithoutPatterns: [
                    {
                      serviceDay: Math.floor(Date.now() / 1000) + 3600,
                      scheduledDeparture: 0,
                      realtimeDeparture: 0,
                      realtime: false,
                    pickupType: 0,
                    stop: { gtfsId: "HSL:1", platformCode: "1" },
                    trip: {
                      route: { shortName: "15", longName: "Kamppi", mode: "BUS" },
                    },
                    headsign: "Kamppi",
                  },
                ],
              },
              s1: {
                platformCode: "2",
                stoptimesWithoutPatterns: [
                    {
                      serviceDay: Math.floor(Date.now() / 1000) + 3600,
                      scheduledDeparture: 0,
                      realtimeDeparture: 0,
                      realtime: false,
                    pickupType: 0,
                    stop: { gtfsId: "HSL:2", platformCode: "2" },
                    trip: {
                      route: { shortName: "16", longName: "Pasila", mode: "BUS" },
                    },
                    headsign: "Pasila",
                  },
                ],
              },
            };
          },
          stops: world.input.lineIntentStopSelection.stops,
          upstreamMode: "BUS",
          requestedResultLimit: 8,
          requestedLines: world.input.lineIntentStopSelection.requestedLines,
        });
      },
    },
    {
      pattern: /^Then line-intent stop selection is null$/,
      run: ({ assert, world }) => {
        assert.equal(world.output, null);
        assert.equal(world.input.lineIntentStopSelection.graphqlCalls, 1);
      },
    },
    {
      pattern: /^Then line-intent stop selection helper id equals "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.output?.selectedStop?.id, args[0]);
      },
    },
  ],
});

test("parseRequiredCoordinate returns null for nullish and blank inputs", () => {
  assert.equal(departuresApi.parseRequiredCoordinate(null), null);
  assert.equal(departuresApi.parseRequiredCoordinate("   "), null);
});

test("parseLineIntentRequested accepts later truthy values from array input", () => {
  assert.equal(departuresApi.parseLineIntentRequested({ lineIntent: ["", "true"] }), true);
});

test("noNearbyStopModeResponse and noNearbyLineIntentResponse keep fallback structure", () => {
  assert.deepEqual(departuresApi.noNearbyStopModeResponse("BUS"), {
    mode: "BUS",
    station: null,
    stops: [],
    selectedStopId: null,
    filterOptions: { lines: [], destinations: [] },
    message: "No nearby bus stops",
  });
  assert.deepEqual(departuresApi.noNearbyLineIntentResponse("BUS", [], ["67"]), {
    mode: "BUS",
    station: null,
    stops: [],
    selectedStopId: null,
    filterOptions: { lines: [], destinations: [] },
    message: "No nearby departures found for bus 67.",
  });
});

test("buildNoNearbyLineIntentMessage covers metro and tram mode labels", () => {
  assert.equal(
    departuresApi.buildNoNearbyLineIntentMessage("METRO", ["M1"]),
    "No nearby departures found for metro M1."
  );
  assert.equal(
    departuresApi.buildNoNearbyLineIntentMessage("TRAM", ["9"]),
    "No nearby departures found for tram 9."
  );
});
