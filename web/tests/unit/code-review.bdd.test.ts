import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "vitest";
import { defineFeature } from "@tests/helpers/bdd-runner";
import { reviewChanges, type ChangeReview, type CorpusFile } from "../../src/review/review.ts";

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const reviewCommand = path.join(webRoot, "tools/review-change.mts");

const loadBoard = `
function loadBoard(origin, mode) {
  const stops = nearbyStops(origin, mode);
  const nearest = stops[0];
  if (!nearest) {
    return emptyBoard(mode);
  }
  const departures = departuresAt(nearest.id, mode);
  const filtered = departures.filter((row) => row.mode === mode);
  return {
    stop: nearest,
    rows: filtered.map((row) => ({
      line: row.line,
      destination: row.headsign,
      minutes: row.minutes,
    })),
  };
}
`;

const loadBoardAgain = `
function loadBoardAgain(origin, mode) {
  const stops = nearbyStops(origin, mode);
  const nearest = stops[0];
  if (!nearest) {
    return blankBoard(mode);
  }
  const departures = departuresAt(nearest.id, mode);
  const filtered = departures.filter((row) => row.mode === mode);
  return {
    stop: nearest,
    rows: filtered.map((row) => ({
      line: row.line,
      destination: row.headsign,
      minutes: row.minutes,
    })),
  };
}
`;

const loadBoardWithWalk = `
function loadBoardWithWalk(origin, mode) {
  const stops = nearbyStops(origin, mode);
  const nearest = stops[0];
  if (!nearest) {
    return emptyBoard(mode);
  }
  const departures = departuresAt(nearest.id, mode);
  const filtered = departures.filter((row) => row.mode === mode);
  const walk = walkTo(origin, nearest);
  return {
    stop: nearest,
    walk,
    rows: filtered.map((row) => ({
      line: row.line,
      destination: row.headsign,
      minutes: row.minutes,
      reachable: walk.seconds < row.minutes * 60,
    })),
  };
}
`;

const formatClock = `
function formatClock(now) {
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  return hours + ":" + minutes;
}
`;

const draftBoard = `
function draftBoard(origin, mode) {
  const stops = nearbyStops(origin, mode);
  const nearest = stops[0];
  if (!nearest) {
    return emptyBoard(mode);
  }
  const departures = departuresAt(nearest.id, mode);
  const filtered = departures.filter((row) => row.mode === mode);
}
`;

const tick = "function tick() {\n  return 1;\n}\n";

const boardFiles: CorpusFile[] = [
  { path: "a.ts", source: loadBoard },
  { path: "b.ts", source: loadBoardAgain },
  { path: "c.ts", source: loadBoardWithWalk },
  { path: "d.ts", source: formatClock },
  { path: "e.ts", source: draftBoard },
];

interface World {
  change: CorpusFile & { lines: number[] };
  corpus: CorpusFile[];
  corpusDir: string;
  exitCode: number | null;
  reviews: readonly ChangeReview[];
  stdout: string;
}

function lineNumbers(source: string): number[] {
  return source.split("\n").map((_, index) => index + 1);
}

function similarNames(reviews: readonly ChangeReview[]): string[] {
  return reviews.flatMap((review) => review.similar.map((method) => method.name));
}

function writeCorpus(directory: string, files: readonly CorpusFile[]): void {
  for (const file of files) {
    fs.writeFileSync(path.join(directory, file.path), file.source);
  }
}

defineFeature<World>(
  test,
  `
Feature: Code review by structural search

  Scenario: Similar methods are the ones that already contain the change
    Given the board corpus
    And the change is every line of e.ts
    When the change is reviewed
    Then the similar methods are loadBoard, loadBoardWithWalk, and loadBoardAgain
    And draftBoard is absent from the similar methods
    And formatClock is absent from the similar methods
    And every similar method scores above 0.71
    And a recommendation adds the line "minutes: row.minutes,"
    And that recommendation names loadBoardAgain

  Scenario: A change that already includes the shared code adds nothing
    Given the board corpus
    And the change is every line of a.ts
    When the change is reviewed
    Then loadBoardAgain is a similar method
    And the recommendations add nothing

  Scenario: A change too small to describe is left unreviewed
    Given the board corpus and the tiny tick function
    When the tiny change is reviewed
    Then the review is empty

  Scenario: The review command prints the similar method and the shared line
    Given the board corpus written to a temp directory
    When the review command checks e.ts
    Then the command exits 0
    And the command output contains loadBoard
    And the command output contains "minutes: row.minutes,"
  `,
  {
    createWorld: () => ({
      change: { path: "", source: "", lines: [] },
      corpus: [],
      corpusDir: "",
      exitCode: null,
      reviews: [],
      stdout: "",
    }),
    stepDefinitions: [
      {
        pattern: /^Given the board corpus$/,
        run: ({ world }) => {
          world.corpus = boardFiles;
        },
      },
      {
        pattern: /^Given the board corpus and the tiny tick function$/,
        run: ({ world }) => {
          world.corpus = [...boardFiles, { path: "t.ts", source: tick }];
          world.change = { path: "t.ts", source: tick, lines: lineNumbers(tick) };
        },
      },
      {
        pattern: /^Given the change is every line of e\.ts$/,
        run: ({ world }) => {
          const source = draftBoard;
          world.change = { path: "e.ts", source, lines: lineNumbers(source) };
        },
      },
      {
        pattern: /^Given the change is every line of a\.ts$/,
        run: ({ world }) => {
          const source = loadBoard;
          world.change = { path: "a.ts", source, lines: lineNumbers(source) };
        },
      },
      {
        pattern: /^Given the board corpus written to a temp directory$/,
        run: ({ world }) => {
          world.corpusDir = fs.mkdtempSync(path.join(os.tmpdir(), "aroma-review-"));
          writeCorpus(world.corpusDir, boardFiles);
        },
      },
      {
        pattern: /^When the change is reviewed$/,
        run: ({ world }) => {
          world.reviews = reviewChanges(world.corpus, [world.change]);
        },
      },
      {
        pattern: /^When the tiny change is reviewed$/,
        run: ({ world }) => {
          world.reviews = reviewChanges(world.corpus, [world.change]);
        },
      },
      {
        pattern: /^When the review command checks e\.ts$/,
        run: ({ world }) => {
          const lines = lineNumbers(draftBoard).join(",");
          const result = spawnSync(
            process.execPath,
            [reviewCommand, "--corpus", world.corpusDir, "--change", "e.ts", "--lines", lines],
            { encoding: "utf8" }
          );
          world.exitCode = result.status;
          world.stdout = result.stdout ?? "";
        },
      },
      {
        pattern: /^Then the similar methods are loadBoard, loadBoardWithWalk, and loadBoardAgain$/,
        run: ({ assert, world }) => {
          assert.equal(
            similarNames(world.reviews).slice().sort().join(","),
            "loadBoard,loadBoardAgain,loadBoardWithWalk"
          );
        },
      },
      {
        pattern: /^Then draftBoard is absent from the similar methods$/,
        run: ({ assert, world }) => {
          assert.equal(similarNames(world.reviews).includes("draftBoard"), false);
        },
      },
      {
        pattern: /^Then formatClock is absent from the similar methods$/,
        run: ({ assert, world }) => {
          assert.equal(similarNames(world.reviews).includes("formatClock"), false);
        },
      },
      {
        pattern: /^Then every similar method scores above 0\.71$/,
        run: ({ assert, world }) => {
          const scores = world.reviews.flatMap((review) => review.similar.map((method) => method.similarity));
          assert.equal(scores.every((score) => score > 0.71), true);
          assert.equal(scores.length, 3);
        },
      },
      {
        pattern: /^Then a recommendation adds the line "minutes: row\.minutes,"$/,
        run: ({ assert, world }) => {
          const added = world.reviews.flatMap((review) =>
            review.recommendations.flatMap((recommendation) => recommendation.added)
          );
          assert.equal(added.includes("minutes: row.minutes,"), true);
        },
      },
      {
        pattern: /^Then that recommendation names loadBoardAgain$/,
        run: ({ assert, world }) => {
          const recommendation = world.reviews
            .flatMap((review) => review.recommendations)
            .find((item) => item.added.includes("minutes: row.minutes,"));
          const names = recommendation
            ? [recommendation.name, ...recommendation.alsoIn.map((method) => method.name)]
            : [];
          assert.match(names.join(","), /loadBoardAgain/);
        },
      },
      {
        pattern: /^Then loadBoardAgain is a similar method$/,
        run: ({ assert, world }) => {
          assert.equal(similarNames(world.reviews).includes("loadBoardAgain"), true);
        },
      },
      {
        pattern: /^Then the recommendations add nothing$/,
        run: ({ assert, world }) => {
          const added = world.reviews.flatMap((review) =>
            review.recommendations.flatMap((recommendation) => recommendation.added)
          );
          assert.equal(added.length, 0);
        },
      },
      {
        pattern: /^Then the review is empty$/,
        run: ({ assert, world }) => {
          assert.equal(world.reviews.length, 0);
        },
      },
      {
        pattern: /^Then the command exits 0$/,
        run: ({ assert, world }) => {
          assert.equal(world.exitCode, 0);
        },
      },
      {
        pattern: /^Then the command output contains loadBoard$/,
        run: ({ assert, world }) => {
          assert.match(world.stdout, /loadBoard/);
        },
      },
      {
        pattern: /^Then the command output contains "minutes: row\.minutes,"$/,
        run: ({ assert, world }) => {
          assert.match(world.stdout, /minutes: row\.minutes,/);
        },
      },
    ],
  }
);
