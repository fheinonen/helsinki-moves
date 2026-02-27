const test = require("node:test");

const { defineFeature } = require("./helpers/bdd");
const geocodeModule = require("../api/v1/geocode");

const helpers = geocodeModule._private;

const featureText = `
Feature: Geocode helper ranking behavior

Scenario: Build geocode text variants with merged and municipality fallbacks
  Given a spoken location query "alepa vihdintie"
  When geocode text variants are built
  Then geocode text variants equal "alepa vihdintie|alepavihdintie|alepa vihdintiehelsinki|alepa vihdintie helsinki|alepa vihdintieespoo"

Scenario: Rank city center candidate before unrelated arena candidate
  Given city center ranking candidates
  When candidates are ranked for query "city center helsinki"
  Then top ranked candidate label equals "Citycenter, Kaivokatu 8, Helsinki"

Scenario: Rank vihdintie-specific Alepa before generic Alepa
  Given vihdintie ranking candidates
  When candidates are ranked for query "alepa vihdintie"
  Then top ranked candidate label equals "Alepa (Alepa Vihdintie), Etelä-Haaga, Helsinki"

Scenario: Build ambiguity choices from close scores
  Given ambiguous ranked candidates
  When ambiguity choices are built
  Then ambiguity choice labels equal "Kamppi, Helsinki|Kamppi Center, Helsinki"

Scenario: Normalize valid and invalid language tags
  Given a requested language value of "finnish"
  When language normalization is executed
  Then the normalized language is null

Scenario: Parse malformed geocode features as null
  Given a malformed geocode feature object
  When geocode feature parsing is executed
  Then geocode feature parsing result is null
`;

defineFeature(test, featureText, {
  createWorld: () => ({
    input: {},
    output: null,
  }),
  stepDefinitions: [
    {
      pattern: /^Given a spoken location query "([^"]*)"$/,
      run: ({ args, world }) => {
        world.input.query = args[0];
      },
    },
    {
      pattern: /^When geocode text variants are built$/,
      run: ({ world }) => {
        world.output = helpers.buildGeocodeTextVariants(world.input.query);
      },
    },
    {
      pattern: /^Then geocode text variants equal "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.output.join("|"), args[0]);
      },
    },
    {
      pattern: /^Given city center ranking candidates$/,
      run: ({ world }) => {
        world.input.candidates = [
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
        ];
      },
    },
    {
      pattern: /^When candidates are ranked for query "([^"]*)"$/,
      run: ({ args, world }) => {
        world.output = helpers.rankCandidatesForQuery(world.input.candidates, args[0]);
      },
    },
    {
      pattern: /^Then top ranked candidate label equals "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.output[0].candidate.label, args[0]);
      },
    },
    {
      pattern: /^Given vihdintie ranking candidates$/,
      run: ({ world }) => {
        world.input.candidates = [
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
        ];
      },
    },
    {
      pattern: /^Given ambiguous ranked candidates$/,
      run: ({ world }) => {
        world.input.rankedCandidates = [
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
        ];
      },
    },
    {
      pattern: /^When ambiguity choices are built$/,
      run: ({ world }) => {
        world.output = helpers.buildAmbiguousChoices(world.input.rankedCandidates);
      },
    },
    {
      pattern: /^Then ambiguity choice labels equal "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.output.map((choice) => choice.label).join("|"), args[0]);
      },
    },
    {
      pattern: /^Given a requested language value of "([^"]*)"$/,
      run: ({ args, world }) => {
        world.input.language = args[0];
      },
    },
    {
      pattern: /^When language normalization is executed$/,
      run: ({ world }) => {
        world.output = helpers.normalizeLanguage(world.input.language);
      },
    },
    {
      pattern: /^Then the normalized language is null$/,
      run: ({ assert, world }) => {
        assert.equal(world.output, null);
      },
    },
    {
      pattern: /^Given a malformed geocode feature object$/,
      run: ({ world }) => {
        world.input.feature = {
          geometry: {
            coordinates: ["x", "y"],
          },
        };
      },
    },
    {
      pattern: /^When geocode feature parsing is executed$/,
      run: ({ world }) => {
        world.output = helpers.parseFeature(world.input.feature);
      },
    },
    {
      pattern: /^Then geocode feature parsing result is null$/,
      run: ({ assert, world }) => {
        assert.equal(world.output, null);
      },
    },
  ],
});
