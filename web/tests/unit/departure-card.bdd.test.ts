import { test } from "vitest";
import { defineFeature } from "@tests/helpers/bdd-runner";
import { renderDepartureCard } from "@client/features/departures/departure-card-view";
import type { Departure } from "@shared/domain/departure";

interface World {
  card?: HTMLTableRowElement;
  departure?: Departure;
  documentRef: Document;
  mode?: "BUS" | "RAIL";
}

defineFeature<World>(
  test,
  `
Feature: Departure card

  Scenario: Departure card shows core departure details
    Given a departure with line 550 destination Kamppi and departure in 5 minutes
    When the departure card is rendered
    Then the card shows line 550
    And the card shows destination Kamppi
    And the card shows a relative departure time

  Scenario: Stop modes show the stop code under the destination
    Given a bus departure with line 550 destination Kamppi stop code A1 and departure in 5 minutes
    When the departure card is rendered
    Then the card shows platform label A1

  Scenario: Rail mode shows the track under the destination
    Given a rail departure with line I destination Airport track 4 and departure in 5 minutes
    When the departure card is rendered
    Then the card shows platform label Track 4
  `,
  {
    createWorld: () => {
      return {
        documentRef: document.implementation.createHTMLDocument("departure-card"),
      };
    },
    stepDefinitions: [
      {
        pattern: /^Given a departure with line 550 destination Kamppi and departure in 5 minutes$/,
        run: ({ world }) => {
          world.departure = {
            departureIso: new Date(Date.now() + 5 * 60_000).toISOString(),
            destination: "Kamppi",
            line: "550",
          };
          world.mode = "BUS";
        },
      },
      {
        pattern: /^Given a bus departure with line 550 destination Kamppi stop code A1 and departure in 5 minutes$/,
        run: ({ world }) => {
          world.departure = {
            departureIso: new Date(Date.now() + 5 * 60_000).toISOString(),
            destination: "Kamppi",
            line: "550",
            stopCode: "A1",
          };
          world.mode = "BUS";
        },
      },
      {
        pattern: /^Given a rail departure with line I destination Airport track 4 and departure in 5 minutes$/,
        run: ({ world }) => {
          world.departure = {
            departureIso: new Date(Date.now() + 5 * 60_000).toISOString(),
            destination: "Airport",
            line: "I",
            track: "4",
          };
          world.mode = "RAIL";
        },
      },
      {
        pattern: /^When the departure card is rendered$/,
        run: ({ world }) => {
          if (!world.departure) {
            throw new Error("Expected departure input");
          }
          world.card = renderDepartureCard({
            departure: world.departure,
            documentRef: world.documentRef,
            mode: world.mode || "BUS",
          });
        },
      },
      {
        pattern: /^Then the card shows line 550$/,
        run: ({ assert, world }) => {
          assert.equal(world.card?.querySelector(".departure-card__line")?.textContent, "550");
        },
      },
      {
        pattern: /^Then the card shows destination Kamppi$/,
        run: ({ assert, world }) => {
          assert.equal(
            world.card?.querySelector(".departure-card__destination-text")?.textContent,
            "Kamppi"
          );
        },
      },
      {
        pattern: /^Then the card shows a relative departure time$/,
        run: ({ assert, world }) => {
          assert.match(
            world.card?.querySelector(".departure-card__time")?.textContent || "",
            /^(Now|\d+m)$/
          );
        },
      },
      {
        pattern: /^Then the card shows platform label (.+)$/,
        run: ({ args, assert, world }) => {
          assert.equal(world.card?.querySelector(".departure-card__platform")?.textContent, args[0]);
        },
      },
    ],
  }
);
