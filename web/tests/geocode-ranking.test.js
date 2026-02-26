const test = require("node:test");
const assert = require("node:assert/strict");

const geocodeModule = require("../api/v1/geocode");
const helpers = geocodeModule?._private || {};

const {
  buildGeocodeTextVariants,
  rankCandidatesForQuery,
  buildAmbiguousChoices,
} = helpers;

test("exposes geocode ranking helpers for regression tests", () => {
  assert.equal(typeof buildGeocodeTextVariants, "function");
  assert.equal(typeof rankCandidatesForQuery, "function");
  assert.equal(typeof buildAmbiguousChoices, "function");
});

test("buildGeocodeTextVariants includes merged and municipality fallbacks", () => {
  const variants = buildGeocodeTextVariants("alepa vihdintie");

  assert.deepEqual(variants, [
    "alepa vihdintie",
    "alepavihdintie",
    "alepa vihdintiehelsinki",
    "alepa vihdintie helsinki",
    "alepa vihdintieespoo",
  ]);
});

test("rankCandidatesForQuery favors Citycenter for city center query", () => {
  const ranked = rankCandidatesForQuery(
    [
      {
        lat: 60.169626,
        lon: 24.941783,
        label: "Citycenter, Kaivokatu 8, Helsinki",
        confidence: 1,
        variantIndex: 0,
      },
      {
        lat: 60.221288,
        lon: 25.079348,
        label: "Arena Center Myllypuro (Fat Pipe Center), Alakiventie 2, Helsinki",
        confidence: 0.94,
        variantIndex: 0,
      },
    ],
    "city center helsinki"
  );

  assert.equal(ranked[0].candidate.label, "Citycenter, Kaivokatu 8, Helsinki");
});

test("rankCandidatesForQuery favors Vihdintie-specific Alepa over generic Alepa", () => {
  const ranked = rankCandidatesForQuery(
    [
      {
        lat: 60.169175,
        lon: 24.948634,
        label: "Alepa, Aleksanterinkatu 9, Helsinki",
        confidence: 1,
        variantIndex: 1,
      },
      {
        lat: 60.210205,
        lon: 24.889042,
        label: "Alepa (Alepa Vihdintie), Etelä-Haaga, Helsinki",
        confidence: 0.927,
        variantIndex: 0,
      },
    ],
    "alepa vihdintie"
  );

  assert.equal(ranked[0].candidate.label, "Alepa (Alepa Vihdintie), Etelä-Haaga, Helsinki");
});

test("buildAmbiguousChoices returns top close matches when ranking is ambiguous", () => {
  const choices = buildAmbiguousChoices([
    {
      candidate: { lat: 60.1699, lon: 24.9384, label: "Kamppi, Helsinki", confidence: 1 },
      strongTokenMatches: 2,
      score: 100,
    },
    {
      candidate: {
        lat: 60.1688,
        lon: 24.9325,
        label: "Kamppi Center, Helsinki",
        confidence: 0.95,
      },
      strongTokenMatches: 2,
      score: 96,
    },
    {
      candidate: { lat: 60.19, lon: 24.95, label: "Ruoholahti, Helsinki", confidence: 0.9 },
      strongTokenMatches: 1,
      score: 95,
    },
  ]);

  assert.equal(choices.length, 2);
  assert.equal(choices[0].label, "Kamppi, Helsinki");
  assert.equal(choices[1].label, "Kamppi Center, Helsinki");
});

