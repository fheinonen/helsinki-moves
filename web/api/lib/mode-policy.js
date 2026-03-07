const MODE_DEFINITIONS = [
  {
    apiMode: "RAIL",
    constant: "MODE_RAIL",
    defaultResults: 8,
    noNearbyMessage: "No nearby train stations",
    lineIntentLabel: "rail",
    upstreamMode: "RAIL",
  },
  {
    apiMode: "TRAM",
    constant: "MODE_TRAM",
    defaultResults: 8,
    noNearbyMessage: "No nearby tram stops",
    lineIntentLabel: "tram",
    upstreamMode: "TRAM",
  },
  {
    apiMode: "METRO",
    constant: "MODE_METRO",
    defaultResults: 8,
    noNearbyMessage: "No nearby metro stops",
    lineIntentLabel: "metro",
    upstreamMode: "SUBWAY",
  },
  {
    apiMode: "BUS",
    constant: "MODE_BUS",
    defaultResults: 24,
    noNearbyMessage: "No nearby bus stops",
    lineIntentLabel: "bus",
    upstreamMode: "BUS",
  },
];

const MODE_BY_NAME = new Map(MODE_DEFINITIONS.map((mode) => [mode.apiMode, mode]));

function getModeDefinition(mode = "RAIL") {
  return MODE_BY_NAME.get(String(mode || "").trim().toUpperCase()) || MODE_BY_NAME.get("RAIL");
}

function parseRequestedMode(rawMode) {
  const normalized = String(rawMode || "RAIL").trim().toUpperCase();
  return MODE_BY_NAME.has(normalized) ? normalized : null;
}

function isSupportedMode(mode) {
  return MODE_BY_NAME.has(String(mode || "").trim().toUpperCase());
}

function getDefaultResultLimit(mode) {
  return getModeDefinition(mode).defaultResults;
}

function getNoNearbyStopsMessage(mode) {
  return getModeDefinition(mode).noNearbyMessage;
}

function getUpstreamMode(mode) {
  return getModeDefinition(mode).upstreamMode;
}

function getLineIntentModeLabel(mode) {
  return getModeDefinition(mode).lineIntentLabel;
}

const modeConstants = MODE_DEFINITIONS.reduce((constants, mode) => {
  constants[mode.constant] = mode.apiMode;
  return constants;
}, {});

module.exports = {
  ...modeConstants,
  MODE_DEFINITIONS,
  getModeDefinition,
  parseRequestedMode,
  isSupportedMode,
  getDefaultResultLimit,
  getNoNearbyStopsMessage,
  getUpstreamMode,
  getLineIntentModeLabel,
};
