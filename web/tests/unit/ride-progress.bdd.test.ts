import { test } from "vitest";
import { defineFeature } from "@tests/helpers/bdd-runner";
import {
  computeRideProgress,
  frameRideRoute,
  parseAppView,
  type RideProgress,
  type RideSnapshot,
} from "@shared/domain/ride";
import type { MapExtent } from "@shared/domain/street-map";

const BASE_MS = Date.parse("2026-03-07T12:30:00.000Z");

interface World {
  boardedStopId?: string | null;
  exitStopId?: string | null;
  extent?: MapExtent | null;
  nowMs?: number;
  parsedView?: string;
  progress?: RideProgress;
  snapshot?: RideSnapshot;
}

function createSampleSnapshot(vehicle: { lat: number; lon: number } | null): RideSnapshot {
  return {
    destination: "Kamppi",
    line: "4",
    mode: "TRAM",
    route: [
      { lat: 60.19, lon: 24.91 },
      { lat: 60.185, lon: 24.92 },
      { lat: 60.18, lon: 24.93 },
      { lat: 60.175, lon: 24.935 },
      { lat: 60.17, lon: 24.94 },
    ],
    stops: [
      {
        arrivalIso: new Date(BASE_MS - 3 * 60_000).toISOString(),
        code: "H0101",
        lat: 60.19,
        lon: 24.91,
        name: "Munkkiniemi",
        platform: null,
        realtime: true,
        stopId: "HSL:1",
      },
      {
        arrivalIso: new Date(BASE_MS + 1 * 60_000).toISOString(),
        code: "H0102",
        lat: 60.185,
        lon: 24.92,
        name: "Meilahti",
        platform: null,
        realtime: true,
        stopId: "HSL:2",
      },
      {
        arrivalIso: new Date(BASE_MS + 4 * 60_000).toISOString(),
        code: "H0103",
        lat: 60.18,
        lon: 24.93,
        name: "Toolo",
        platform: null,
        realtime: true,
        stopId: "HSL:3",
      },
      {
        arrivalIso: new Date(BASE_MS + 7 * 60_000).toISOString(),
        code: "H0104",
        lat: 60.175,
        lon: 24.935,
        name: "Lasipalatsi",
        platform: null,
        realtime: true,
        stopId: "HSL:4",
      },
      {
        arrivalIso: new Date(BASE_MS + 10 * 60_000).toISOString(),
        code: "H0105",
        lat: 60.17,
        lon: 24.94,
        name: "Kamppi",
        platform: "2",
        realtime: true,
        stopId: "HSL:5",
      },
    ],
    tripId: "HSL:TRIP_4",
    vehicle,
  };
}

defineFeature<World>(
  test,
  `
Feature: Ride progress tracking

  Scenario: Live vehicle position advances past already passed stops
    Given a live ride snapshot with the vehicle between Meilahti and Toolo
    When ride progress is calculated at the current time
    Then the ride telemetry mode is live
    And the next stop is Toolo
    And 2 stops are marked as past

  Scenario: Underground or missing GPS falls back to timetable progression
    Given a ride snapshot without vehicle coordinates
    When ride progress is calculated at 5 minutes after base time
    Then the ride telemetry mode is timetable
    And the next stop is Lasipalatsi
    And 3 stops are marked as past

  Scenario: Pinning an exit stop shows countdown, dims later stops, and escalates urgency
    Given a live ride snapshot with the vehicle between Meilahti and Toolo
    And the rider pinned Lasipalatsi as their exit stop
    When ride progress is calculated at the current time
    Then the exit countdown reports 2 stops and 7 minutes with approaching urgency
    And Kamppi is marked as beyond-exit

  Scenario: Reaching the stop before a pinned exit triggers exit-next urgency
    Given a ride snapshot without vehicle coordinates
    And the rider pinned Lasipalatsi as their exit stop
    When ride progress is calculated at 5 minutes after base time
    Then the exit countdown reports 1 stops and 2 minutes with exit-next urgency

  Scenario: Passing the final stop marks the ride as arrived
    Given a ride snapshot without vehicle coordinates
    When ride progress is calculated at 15 minutes after base time
    Then the ride status is arrived
    And the next stop is none

  Scenario: Boarding stop prevents earlier stops from appearing as next
    Given a ride snapshot without vehicle coordinates
    And the rider boarded at Toolo
    When ride progress is calculated at the current time
    Then the next stop is Toolo

  Scenario: Framing the ride route covers the vehicle and remaining stops
    Given a live ride snapshot with the vehicle between Meilahti and Toolo
    When the ride route frame is computed
    Then the ride route frame encloses both the vehicle and Kamppi

  Scenario: Invalid view names default to wait
    When an invalid view name is parsed
    Then the resolved app view is wait

  Scenario: Exit stop three or more stops ahead stays calm
    Given a live ride snapshot with the vehicle between Meilahti and Toolo
    And the rider pinned Kamppi as their exit stop
    When ride progress is calculated at the current time
    Then the exit countdown reports 3 stops and 10 minutes with calm urgency

  Scenario: Already passed exit stop reports arrived urgency
    Given a live ride snapshot with the vehicle between Meilahti and Toolo
    And the rider pinned Meilahti as their exit stop
    When ride progress is calculated at the current time
    Then the exit countdown reports 0 stops and 0 minutes with arrived urgency

  Scenario: Route-less snapshot falls back to stop coordinates and empty snapshot produces no frame
    Given a ride snapshot without route geometry and with an empty stops check
    When ride progress is calculated at the current time
    And the empty ride route frame is computed
    Then the next stop is Toolo
    And the empty route frame is null
  `,
  {
    createWorld: () => ({ nowMs: BASE_MS }),
    stepDefinitions: [
      {
        pattern: /^Given a live ride snapshot with the vehicle between Meilahti and Toolo$/,
        run: ({ world }) => {
          world.snapshot = createSampleSnapshot({ lat: 60.182, lon: 24.926 });
          world.nowMs = BASE_MS;
        },
      },
      {
        pattern: /^Given a ride snapshot without vehicle coordinates$/,
        run: ({ world }) => {
          world.snapshot = createSampleSnapshot(null);
          world.nowMs = BASE_MS;
        },
      },
      {
        pattern: /^Given a ride snapshot without route geometry and with an empty stops check$/,
        run: ({ world }) => {
          world.snapshot = {
            ...createSampleSnapshot({ lat: 60.182, lon: 24.926 }),
            route: [],
          };
          world.nowMs = BASE_MS;
        },
      },
      {
        pattern: /^Given the rider pinned (.+) as their exit stop$/,
        run: ({ args, world }) => {
          const match = world.snapshot?.stops.find((stop) => stop.name === args[0]);
          world.exitStopId = match?.stopId ?? null;
        },
      },
      {
        pattern: /^Given the rider boarded at (.+)$/,
        run: ({ args, world }) => {
          const match = world.snapshot?.stops.find((stop) => stop.name === args[0]);
          world.boardedStopId = match?.stopId ?? null;
        },
      },
      {
        pattern: /^When ride progress is calculated at the current time$/,
        run: ({ world }) => {
          if (!world.snapshot) {
            throw new Error("Snapshot required");
          }
          world.progress = computeRideProgress(world.snapshot, world.nowMs ?? BASE_MS, {
            boardedStopId: world.boardedStopId,
            exitStopId: world.exitStopId,
          });
        },
      },
      {
        pattern: /^When ride progress is calculated at (\d+) minutes after base time$/,
        run: ({ args, world }) => {
          if (!world.snapshot) {
            throw new Error("Snapshot required");
          }
          const minutes = Number(args[0]);
          world.progress = computeRideProgress(world.snapshot, BASE_MS + minutes * 60_000, {
            boardedStopId: world.boardedStopId,
            exitStopId: world.exitStopId,
          });
        },
      },
      {
        pattern: /^When the ride route frame is computed$/,
        run: ({ world }) => {
          if (!world.snapshot) {
            throw new Error("Snapshot required");
          }
          world.extent = frameRideRoute(world.snapshot);
        },
      },
      {
        pattern: /^When an invalid view name is parsed$/,
        run: ({ world }) => {
          world.parsedView = parseAppView("teleport");
        },
      },
      {
        pattern: /^Then the ride telemetry mode is (live|timetable)$/,
        run: ({ args, assert, world }) => {
          assert.equal(world.progress?.telemetry, args[0]);
        },
      },
      {
        pattern: /^Then the next stop is (.+)$/,
        run: ({ args, assert, world }) => {
          const expected = args[0] === "none" ? null : args[0];
          assert.equal(world.progress?.nextStop?.name ?? null, expected);
        },
      },
      {
        pattern: /^Then (\d+) stops are marked as past$/,
        run: ({ args, assert, world }) => {
          assert.equal(world.progress?.pastCount, Number(args[0]));
        },
      },
      {
        pattern: /^Then the exit countdown reports (\d+) stops and (\d+) minutes with (.+) urgency$/,
        run: ({ args, assert, world }) => {
          assert.equal(world.progress?.exit?.stopsRemaining, Number(args[0]));
          assert.equal(world.progress?.exit?.minutesRemaining, Number(args[1]));
          assert.equal(world.progress?.exit?.urgency, args[2]);
        },
      },
      {
        pattern: /^Then (.+) is marked as beyond-exit$/,
        run: ({ args, assert, world }) => {
          const entry = world.progress?.stops.find((item) => item.stop.name === args[0]);
          assert.equal(entry?.state, "beyond-exit");
        },
      },
      {
        pattern: /^Then the ride status is (active|arrived)$/,
        run: ({ args, assert, world }) => {
          assert.equal(world.progress?.status, args[0]);
        },
      },
      {
        pattern: /^Then the ride route frame encloses both the vehicle and (.+)$/,
        run: ({ args, assert, world }) => {
          const stop = world.snapshot?.stops.find((item) => item.name === args[0]);
          const vehicle = world.snapshot?.vehicle;
          const extent = world.extent;
          const encloses = Boolean(
            extent &&
              stop &&
              vehicle &&
              extent.south <= Math.min(stop.lat, vehicle.lat) &&
              extent.north >= Math.max(stop.lat, vehicle.lat) &&
              extent.west <= Math.min(stop.lon, vehicle.lon) &&
              extent.east >= Math.max(stop.lon, vehicle.lon),
          );
          assert.equal(encloses, true);
        },
      },
      {
        pattern: /^When the empty ride route frame is computed$/,
        run: ({ world }) => {
          world.extent = frameRideRoute({
            destination: "Kamppi",
            line: "4",
            mode: "TRAM",
            route: [],
            stops: [],
            tripId: "HSL:EMPTY",
            vehicle: null,
          });
        },
      },
      {
        pattern: /^Then the empty route frame is null$/,
        run: ({ assert, world }) => {
          assert.equal(world.extent, null);
        },
      },
      {
        pattern: /^Then the resolved app view is (.+)$/,
        run: ({ args, assert, world }) => {
          assert.equal(world.parsedView, args[0]);
        },
      },
    ],
  }
);
