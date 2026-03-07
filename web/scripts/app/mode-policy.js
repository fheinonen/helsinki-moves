const MODE_DEFINITIONS = [
  {
    value: "rail",
    constant: "MODE_RAIL",
    title: "Rail",
    singular: "train",
    plural: "trains",
    noNearbyMessage: "No nearby train stations",
    defaultResults: 8,
  },
  {
    value: "tram",
    constant: "MODE_TRAM",
    title: "Tram",
    singular: "tram",
    plural: "trams",
    noNearbyMessage: "No nearby tram stops",
    defaultResults: 8,
  },
  {
    value: "metro",
    constant: "MODE_METRO",
    title: "Metro",
    singular: "metro",
    plural: "metros",
    noNearbyMessage: "No nearby metro stops",
    defaultResults: 8,
  },
  {
    value: "bus",
    constant: "MODE_BUS",
    title: "Bus",
    singular: "bus",
    plural: "buses",
    noNearbyMessage: "No nearby bus stops",
    defaultResults: 24,
  },
];

const MODE_BY_VALUE = new Map(MODE_DEFINITIONS.map((mode) => [mode.value, mode]));

function normalizeMode(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  return MODE_BY_VALUE.has(normalized) ? normalized : null;
}

function getModeDefinition(value = "rail") {
  return MODE_BY_VALUE.get(normalizeMode(value) || "rail");
}

function isStopMode(value) {
  return Boolean(getModeDefinition(value));
}

function getModeConstants() {
  return MODE_DEFINITIONS.reduce((constants, mode) => {
    constants[mode.constant] = mode.value;
    return constants;
  }, {});
}

function getResultLimitDefaults() {
  return MODE_DEFINITIONS.reduce((defaults, mode) => {
    defaults[mode.value] = mode.defaultResults;
    return defaults;
  }, {});
}

module.exports = {
  MODE_DEFINITIONS,
  normalizeMode,
  getModeDefinition,
  getModeConstants,
  getResultLimitDefaults,
  isStopMode,
};
