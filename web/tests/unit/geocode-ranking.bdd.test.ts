import { test } from "vitest";
import { defineFeature } from "@tests/helpers/bdd-runner";
import {
  buildAmbiguousChoices,
  rankCandidatesForQuery,
} from "@server/services/geocode/ranking";

interface CandidateInput {
  confidence: number | null;
  label: string;
  latitude: number;
  longitude: number;
  queryVariant?: string;
  variantIndex?: number;
}

interface World {
  ambiguousChoices?: ReturnType<typeof buildAmbiguousChoices>;
  candidates?: CandidateInput[];
  query?: string;
  ranked?: ReturnType<typeof rankCandidatesForQuery>;
}

defineFeature<World>(
  test,
  `
Feature: Geocode ranking

  Scenario: Ranking prefers the candidate that matches a normalized variant of the query
    Given a geocode ranking query of Mannerheimin-tie 10
    And geocode ranking candidates Mannerheimintie 10, Helsinki | Mannerheimintie, Helsinki | Kamppi, Helsinki
    When geocode candidates are ranked
    Then the top ranked geocode label is Mannerheimintie 10, Helsinki
    And the candidate Kamppi, Helsinki has zero strong token matches

  Scenario: Ambiguous choices keep only close unique high-match locations and cap the list at four
    Given ranked geocode candidates for five Kamppi matches one duplicate and one unrelated place
    When ambiguous geocode choices are built
    Then four ambiguous geocode choices are returned
    And the duplicate coordinate appears once in ambiguous geocode choices
    And ambiguous geocode choices exclude Kamppi Zoo, Helsinki
  `,
  {
    createWorld: () => ({}),
    stepDefinitions: [
      {
        pattern: /^Given a geocode ranking query of (.+)$/,
        run: ({ args, world }) => {
          world.query = args[0];
        },
      },
      {
        pattern: /^Given geocode ranking candidates (.+)$/,
        run: ({ args, world }) => {
          const labels = args[0].split(" | ");
          world.candidates = [
            {
              confidence: 0.95,
              label: labels[0],
              latitude: 60.17,
              longitude: 24.94,
              queryVariant: "Mannerheimintie 10",
              variantIndex: 1,
            },
            {
              confidence: 0.99,
              label: labels[1],
              latitude: 60.18,
              longitude: 24.95,
            },
            {
              confidence: 1,
              label: labels[2],
              latitude: 60.19,
              longitude: 24.96,
            },
          ];
        },
      },
      {
        pattern: /^Given ranked geocode candidates for five Kamppi matches one duplicate and one unrelated place$/,
        run: ({ world }) => {
          world.ranked = [
            {
              candidate: { confidence: 0.9, label: "Kamppi, Helsinki", latitude: 60.17, longitude: 24.93 },
              score: 96,
              strongTokenMatches: 1,
            },
            {
              candidate: { confidence: 0.88, label: "Kamppi Center, Helsinki", latitude: 60.1705, longitude: 24.931 },
              score: 94,
              strongTokenMatches: 1,
            },
            {
              candidate: { confidence: 0.87, label: "Kamppi Terminal, Helsinki", latitude: 60.171, longitude: 24.932 },
              score: 93,
              strongTokenMatches: 1,
            },
            {
              candidate: { confidence: 0.86, label: "Kamppi Metro, Helsinki", latitude: 60.1715, longitude: 24.933 },
              score: 92,
              strongTokenMatches: 1,
            },
            {
              candidate: { confidence: 0.85, label: "Kamppi Duplicate, Helsinki", latitude: 60.17, longitude: 24.93 },
              score: 91,
              strongTokenMatches: 1,
            },
            {
              candidate: { confidence: 0.84, label: "Kamppi Zoo, Helsinki", latitude: 60.25, longitude: 24.8 },
              score: 70,
              strongTokenMatches: 1,
            },
          ] as ReturnType<typeof rankCandidatesForQuery>;
        },
      },
      {
        pattern: /^When geocode candidates are ranked$/,
        run: ({ world }) => {
          world.ranked = rankCandidatesForQuery(world.candidates || [], world.query || "");
        },
      },
      {
        pattern: /^When ambiguous geocode choices are built$/,
        run: ({ world }) => {
          world.ambiguousChoices = buildAmbiguousChoices(world.ranked || []);
        },
      },
      {
        pattern: /^Then the top ranked geocode label is (.+)$/,
        run: ({ args, assert, world }) => {
          assert.equal(world.ranked?.[0]?.candidate.label, args[0]);
        },
      },
      {
        pattern: /^Then the candidate (.+) has zero strong token matches$/,
        run: ({ args, assert, world }) => {
          const candidate = (world.ranked || []).find((entry) => entry.candidate.label === args[0]);
          assert.equal(candidate?.strongTokenMatches, 0);
        },
      },
      {
        pattern: /^Then four ambiguous geocode choices are returned$/,
        run: ({ assert, world }) => {
          assert.equal(world.ambiguousChoices?.length, 4);
        },
      },
      {
        pattern: /^Then the duplicate coordinate appears once in ambiguous geocode choices$/,
        run: ({ assert, world }) => {
          const duplicateCount = (world.ambiguousChoices || []).filter(
            (choice) => choice.latitude === 60.17 && choice.longitude === 24.93
          ).length;
          assert.equal(duplicateCount, 1);
        },
      },
      {
        pattern: /^Then ambiguous geocode choices exclude (.+)$/,
        run: ({ args, assert, world }) => {
          assert.equal((world.ambiguousChoices || []).some((choice) => choice.label === args[0]), false);
        },
      },
    ],
  }
);
