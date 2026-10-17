const test = require("node:test");

const { defineFeature } = require("./helpers/bdd");
const departuresUtils = require("../api/lib/departures-utils");

const departuresUtilsFeature = `
Feature: Additional departure utility branches

Scenario: Parse explicit requested modes
  Given requested mode input "tram"
  When requested mode parsing executes
  Then requested mode parsing output equals "TRAM"

Scenario: Reject unsupported requested modes
  Given requested mode input "plane"
  When requested mode parsing executes
  Then requested mode parsing output is null

Scenario: Parse empty requested result limit as default
  Given requested result raw value "" and default 8
  When requested result parsing executes
  Then requested result parsing output equals 8

Scenario: Parse valid requested result limit integer
  Given requested result raw value "16" and default 8
  When requested result parsing executes
  Then requested result parsing output equals 16

Scenario: Reject non-integer requested result limit
  Given requested result raw value "16.5" and default 8
  When requested result parsing executes
  Then requested result parsing output is null

Scenario: Normalize pickup type phone agency to enum 2
  Given pickup type input "PHONE_AGENCY"
  When pickup normalization executes
  Then pickup normalization output equals 2

Scenario: Normalize pickup type coordinate with driver to enum 3
  Given pickup type input "COORDINATE_WITH_DRIVER"
  When pickup normalization executes
  Then pickup normalization output equals 3

Scenario: Normalize unknown pickup string to enum 0
  Given pickup type input "SOMETHING_ELSE"
  When pickup normalization executes
  Then pickup normalization output equals 0

Scenario: Parse departure with fallback stop metadata
  Given a stop time with missing stop metadata and scheduled-only departure
  When departure parsing executes for mode "BUS"
  Then parsed departure stop id equals "HSL:fall"
  And parsed departure stop name equals "Fallback Stop"

Scenario: Reject departures with mismatched route mode
  Given a stop time with route mode "TRAM"
  When departure parsing executes for mode "BUS"
  Then departure parsing output is null

Scenario: Parse comma-separated multi query arrays
  Given multi query array values "550,551|551,M2"
  When multi query parsing executes
  Then multi query parsing output equals "550|551|M2"

Scenario: Parse METRO requested mode
  Given requested mode input "metro"
  When requested mode parsing executes
  Then requested mode parsing output equals "METRO"

Scenario: Parse null multi query input
  Given multi query input is null
  When multi query parsing executes
  Then multi query parsing output equals ""

Scenario: Parse null requested result limit as default
  Given requested result input is null and default 12
  When requested result parsing executes
  Then requested result parsing output equals 12

Scenario: Reject out-of-range requested result limit
  Given requested result raw value "61" and default 8
  When requested result parsing executes
  Then requested result parsing output is null

Scenario: Normalize numeric pickup type value
  Given pickup type numeric input 2
  When pickup normalization executes
  Then pickup normalization output equals 2

Scenario: Reject non-integer numeric pickup type value
  Given pickup type numeric input 2.5
  When pickup normalization executes
  Then pickup normalization output is null

Scenario: Normalize numeric-string pickup type value
  Given pickup type input "3"
  When pickup normalization executes
  Then pickup normalization output equals 3

Scenario: Normalize whitespace pickup type string as unknown enum
  Given pickup type input "   "
  When pickup normalization executes
  Then pickup normalization output equals 0

Scenario: Boardability defaults to true when pickup type is missing
  Given stop time without pickup type
  When boardability helper executes
  Then boardability helper output equals true

Scenario: Parse departure with fallback track and service line name
  Given stop time with missing line and platform and fallback track "B"
  When departure parsing executes for mode "BUS"
  Then parsed departure line equals "Service"
  And parsed departure track equals "B"

Scenario: Reject departure when service day is invalid
  Given stop time with invalid service day
  When departure parsing executes for mode "BUS"
  Then departure parsing output is null

Scenario: Reject departure when departure seconds are invalid
  Given stop time with invalid departure seconds
  When departure parsing executes for mode "BUS"
  Then departure parsing output is null

Scenario: Build filter options ignores blank fields and sorts ties alphabetically
  Given departures with line tie and blank values
  When filter options are built from helper
  Then helper line filter options equal "A:1|B:1"
  And helper destination filter options equal "Kamppi:1|Pasila:1"
`;

defineFeature(test, departuresUtilsFeature, {
  createWorld: () => ({
    input: {},
    output: null,
  }),
  stepDefinitions: [
    {
      pattern: /^Given requested mode input "([^"]*)"$/,
      run: ({ args, world }) => {
        world.input.mode = args[0];
      },
    },
    {
      pattern: /^When requested mode parsing executes$/,
      run: ({ world }) => {
        world.output = departuresUtils.parseRequestedMode(world.input.mode);
      },
    },
    {
      pattern: /^Then requested mode parsing output equals "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.output, args[0]);
      },
    },
    {
      pattern: /^Then requested mode parsing output is null$/,
      run: ({ assert, world }) => {
        assert.equal(world.output, null);
      },
    },
    {
      pattern: /^Given requested result raw value "([^"]*)" and default (\d+)$/,
      run: ({ args, world }) => {
        world.input.raw = args[0];
        world.input.defaultValue = Number(args[1]);
      },
    },
    {
      pattern: /^Given requested result input is null and default (\d+)$/,
      run: ({ args, world }) => {
        world.input.raw = null;
        world.input.defaultValue = Number(args[0]);
      },
    },
    {
      pattern: /^When requested result parsing executes$/,
      run: ({ world }) => {
        world.output = departuresUtils.parseRequestedResultLimit(
          world.input.raw,
          world.input.defaultValue
        );
      },
    },
    {
      pattern: /^Then requested result parsing output equals (\d+)$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.output, Number(args[0]));
      },
    },
    {
      pattern: /^Then requested result parsing output is null$/,
      run: ({ assert, world }) => {
        assert.equal(world.output, null);
      },
    },
    {
      pattern: /^Given pickup type input "([^"]*)"$/,
      run: ({ args, world }) => {
        world.input.pickup = args[0];
      },
    },
    {
      pattern: /^Given pickup type numeric input (-?\d+(?:\.\d+)?)$/,
      run: ({ args, world }) => {
        world.input.pickup = Number(args[0]);
      },
    },
    {
      pattern: /^When pickup normalization executes$/,
      run: ({ world }) => {
        world.output = departuresUtils.normalizePickDropType(world.input.pickup);
      },
    },
    {
      pattern: /^Then pickup normalization output equals (\d+)$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.output, Number(args[0]));
      },
    },
    {
      pattern: /^Then pickup normalization output is null$/,
      run: ({ assert, world }) => {
        assert.equal(world.output, null);
      },
    },
    {
      pattern: /^Given stop time without pickup type$/,
      run: ({ world }) => {
        world.input.stopTime = {};
      },
    },
    {
      pattern: /^When boardability helper executes$/,
      run: ({ world }) => {
        world.output = departuresUtils.isBoardableStopTime(world.input.stopTime);
      },
    },
    {
      pattern: /^Then boardability helper output equals (true|false)$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.output, args[0] === "true");
      },
    },
    {
      pattern: /^Given a stop time with missing stop metadata and scheduled-only departure$/,
      run: ({ world }) => {
        world.input.stopTime = {
          serviceDay: 1_700_000_000,
          realtimeDeparture: "nan",
          scheduledDeparture: 120,
          pickupType: 0,
          headsign: "Kamppi",
          stop: {},
          trip: { route: { mode: "BUS", shortName: "550" } },
        };
        world.input.fallbackStop = {
          gtfsId: "HSL:fall",
          code: "FALL",
          name: "Fallback Stop",
        };
        world.input.fallbackTrack = null;
      },
    },
    {
      pattern: /^Given stop time with missing line and platform and fallback track "([^"]*)"$/,
      run: ({ args, world }) => {
        world.input.stopTime = {
          serviceDay: 1_700_000_000,
          realtimeDeparture: 60,
          scheduledDeparture: 60,
          pickupType: 0,
          headsign: "Kamppi",
          stop: {
            gtfsId: "HSL:1",
            name: "Kamppi",
            code: "1",
            platformCode: "",
          },
          trip: { route: { mode: "BUS", shortName: "" } },
        };
        world.input.fallbackStop = null;
        world.input.fallbackTrack = args[0];
      },
    },
    {
      pattern: /^Given stop time with invalid service day$/,
      run: ({ world }) => {
        world.input.stopTime = {
          serviceDay: "bad",
          realtimeDeparture: 60,
          scheduledDeparture: 60,
          pickupType: 0,
          headsign: "Kamppi",
          stop: { gtfsId: "HSL:1", name: "Kamppi", code: "1" },
          trip: { route: { mode: "BUS", shortName: "550" } },
        };
        world.input.fallbackStop = null;
        world.input.fallbackTrack = null;
      },
    },
    {
      pattern: /^Given stop time with invalid departure seconds$/,
      run: ({ world }) => {
        world.input.stopTime = {
          serviceDay: 1_700_000_000,
          realtimeDeparture: "nan",
          scheduledDeparture: "nan",
          pickupType: 0,
          headsign: "Kamppi",
          stop: { gtfsId: "HSL:1", name: "Kamppi", code: "1" },
          trip: { route: { mode: "BUS", shortName: "550" } },
        };
        world.input.fallbackStop = null;
        world.input.fallbackTrack = null;
      },
    },
    {
      pattern: /^When departure parsing executes for mode "([^"]*)"$/,
      run: ({ args, world }) => {
        world.output = departuresUtils.parseDeparture(
          world.input.stopTime,
          world.input.fallbackTrack || null,
          args[0],
          world.input.fallbackStop
        );
      },
    },
    {
      pattern: /^Then parsed departure stop id equals "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.output.stopId, args[0]);
      },
    },
    {
      pattern: /^Then parsed departure stop name equals "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.output.stopName, args[0]);
      },
    },
    {
      pattern: /^Then parsed departure line equals "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.output?.line, args[0]);
      },
    },
    {
      pattern: /^Then parsed departure track equals "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.output?.track, args[0]);
      },
    },
    {
      pattern: /^Given a stop time with route mode "([^"]*)"$/,
      run: ({ args, world }) => {
        world.input.stopTime = {
          serviceDay: 1_700_000_000,
          realtimeDeparture: 120,
          scheduledDeparture: 120,
          pickupType: 0,
          headsign: "Kamppi",
          stop: { gtfsId: "HSL:1", name: "Kamppi", code: "1" },
          trip: { route: { mode: args[0], shortName: "10" } },
        };
        world.input.fallbackStop = null;
      },
    },
    {
      pattern: /^Then departure parsing output is null$/,
      run: ({ assert, world }) => {
        assert.equal(world.output, null);
      },
    },
    {
      pattern: /^Given multi query array values "([^"]*)"$/,
      run: ({ args, world }) => {
        world.input.multi = args[0].split("|");
      },
    },
    {
      pattern: /^Given multi query input is null$/,
      run: ({ world }) => {
        world.input.multi = null;
      },
    },
    {
      pattern: /^When multi query parsing executes$/,
      run: ({ world }) => {
        world.output = departuresUtils.parseMultiQueryParam(world.input.multi);
      },
    },
    {
      pattern: /^Then multi query parsing output equals "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.output.join("|"), args[0]);
      },
    },
    {
      pattern: /^Given departures with line tie and blank values$/,
      run: ({ world }) => {
        world.input.departures = [
          { line: "B", destination: "Kamppi" },
          { line: "A", destination: "Pasila" },
          { line: "", destination: " " },
        ];
      },
    },
    {
      pattern: /^When filter options are built from helper$/,
      run: ({ world }) => {
        world.output = departuresUtils.buildFilterOptions(world.input.departures);
      },
    },
    {
      pattern: /^Then helper line filter options equal "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        const actual = world.output.lines.map((item) => `${item.value}:${item.count}`).join("|");
        assert.equal(actual, args[0]);
      },
    },
    {
      pattern: /^Then helper destination filter options equal "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        const actual = world.output.destinations.map((item) => `${item.value}:${item.count}`).join("|");
        assert.equal(actual, args[0]);
      },
    },
  ],
});
