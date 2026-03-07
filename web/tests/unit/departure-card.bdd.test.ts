import { test } from "vitest";
import { defineFeature } from "@tests/helpers/bdd-runner";
import { renderDepartureCard } from "@client/features/departures/departure-card-view";
import type { Departure } from "@shared/domain/departure";

interface World {
  card?: HTMLLIElement;
  departure?: Departure;
  documentRef: Document;
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
            world.card?.querySelector(".departure-card__destination")?.textContent,
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
    ],
  }
);
