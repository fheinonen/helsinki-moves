import type { Hono } from "hono";
import type { Departure } from "../../shared/domain/departure.js";
import { MODES, parseMode, type Mode } from "../../shared/domain/mode.js";
import {
  chooseDefaultTransferMode,
  TRANSFER_RADIUS_METERS,
  type TransferOption,
  type TransfersResponse,
} from "../../shared/domain/transfer.js";
import { buildSelectableStops } from "../services/digitransit/departures-normalizer.js";
import type { DigitransitService, NearbyStopNode } from "../services/digitransit/types.js";
import { transferFetchWindow } from "../services/glance/glance-horizon.js";

const PRE_ARRIVAL_WINDOW_MS = 5 * 60_000;
const TRANSFER_HORIZON_SECONDS = 50 * 60;
const MAX_TRANSFER_STOPS = 4;
const MAX_TRANSFER_OPTIONS = 16;

interface TransfersRouteOptions {
  digitransitService: DigitransitService;
}

function parseFiniteNumber(raw: string | null): number | null {
  if (!raw || !raw.trim()) {
    return null;
  }
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function parseArrivalMs(raw: string | null): number | null {
  if (!raw || !raw.trim()) {
    return null;
  }
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : null;
}

function normalizeUpstreamMode(raw: string | undefined): Mode | null {
  const upper = String(raw || "").trim().toUpperCase();
  if (upper === "SUBWAY") {
    return "METRO";
  }
  if (upper === "RAIL" || upper === "TRAM" || upper === "METRO" || upper === "BUS") {
    return upper;
  }
  return null;
}

function groupStopsByMode(nodes: readonly NearbyStopNode[]): Map<Mode, NearbyStopNode[]> {
  const grouped = new Map<Mode, NearbyStopNode[]>();
  for (const node of nodes) {
    const mode = normalizeUpstreamMode(node.stop.vehicleMode);
    if (!mode) {
      continue;
    }
    const list = grouped.get(mode) ?? [];
    list.push(node);
    grouped.set(mode, list);
  }
  for (const list of grouped.values()) {
    list.sort((left, right) => left.distance - right.distance);
  }
  return grouped;
}

function orderedAvailableModes(grouped: Map<Mode, NearbyStopNode[]>): Mode[] {
  return MODES.filter((mode) => (grouped.get(mode)?.length ?? 0) > 0);
}

function parseRequestedMode(raw: string | null, available: readonly Mode[]): Mode | null {
  if (!raw || !raw.trim()) {
    return null;
  }
  const parsed = parseMode(raw.trim().toUpperCase(), "BUS");
  return available.includes(parsed) ? parsed : null;
}

function toTransferOption(input: {
  departure: Departure;
  distanceByStopId: Map<string, number>;
  fallbackDistance: number;
  fallbackStopName: string;
  mode: Mode;
}): TransferOption | null {
  const { departure, distanceByStopId, fallbackDistance, fallbackStopName, mode } = input;
  const stopId = departure.stopId?.trim() || "";
  const tripId = departure.tripId?.trim() || "";
  if (!stopId || !tripId) {
    return null;
  }
  return {
    departureIso: departure.departureIso,
    destination: departure.destination,
    distanceMeters: distanceByStopId.get(stopId) ?? fallbackDistance,
    line: departure.line,
    mode,
    platform: departure.track || departure.stopCode || null,
    stopId,
    stopName: departure.stopName || fallbackStopName,
    tripId,
  };
}

function collectTransferOptions(input: {
  departuresByStopId: Map<string, Departure[]>;
  mode: Mode;
  nodes: readonly NearbyStopNode[];
  stopIds: readonly string[];
  stopName: string;
}): TransferOption[] {
  const distanceByStopId = new Map(input.nodes.map((node) => [node.stop.gtfsId, node.distance]));
  const fallbackDistance = input.nodes[0]?.distance ?? 0;
  const seen = new Set<string>();
  const options: TransferOption[] = [];

  for (const stopId of input.stopIds) {
    for (const departure of input.departuresByStopId.get(stopId) ?? []) {
      const option = toTransferOption({
        departure,
        distanceByStopId,
        fallbackDistance,
        fallbackStopName: input.stopName,
        mode: input.mode,
      });
      if (!option || seen.has(option.tripId)) {
        continue;
      }
      seen.add(option.tripId);
      options.push(option);
    }
  }

  return options
    .sort((left, right) => Date.parse(left.departureIso) - Date.parse(right.departureIso))
    .slice(0, MAX_TRANSFER_OPTIONS);
}

export function registerTransfersRoute(app: Hono, options: TransfersRouteOptions): void {
  const { digitransitService } = options;

  app.get("/api/v1/transfers", async (context) => {
    const url = new URL(context.req.url);
    const lat = parseFiniteNumber(url.searchParams.get("lat"));
    const lon = parseFiniteNumber(url.searchParams.get("lon"));
    const arrivalMs = parseArrivalMs(url.searchParams.get("arrivalIso"));
    if (lat == null || lon == null || arrivalMs == null) {
      return context.json({ error: "Missing or invalid transfer parameters." }, 400);
    }

    const rideMode = parseMode(url.searchParams.get("rideMode")?.trim().toUpperCase(), "BUS");
    const nearby = await digitransitService.getNearbyStops({
      lat,
      lon,
      radius: TRANSFER_RADIUS_METERS,
    });
    const grouped = groupStopsByMode(nearby);
    const availableModes = orderedAvailableModes(grouped);
    const selectedMode =
      parseRequestedMode(url.searchParams.get("mode"), availableModes) ??
      chooseDefaultTransferMode(availableModes, rideMode);

    if (!selectedMode) {
      const empty: TransfersResponse = {
        availableModes: [],
        mode: rideMode,
        options: [],
      };
      context.header("Cache-Control", "no-store");
      return context.json(empty, 200);
    }

    const modeNodes = grouped.get(selectedMode) ?? [];
    const selectable = buildSelectableStops(modeNodes);
    const primary = selectable[0];
    const memberStopIds = (primary?.memberStopIds ?? modeNodes.map((n) => n.stop.gtfsId)).slice(
      0,
      MAX_TRANSFER_STOPS,
    );
    const windowStartMs = arrivalMs - PRE_ARRIVAL_WINDOW_MS;
    const departuresByStopId = await digitransitService.getDeparturesForStopIds(memberStopIds, {
      fetchWindow: transferFetchWindow(windowStartMs, TRANSFER_HORIZON_SECONDS),
      mode: selectedMode,
    });

    const payload: TransfersResponse = {
      availableModes,
      mode: selectedMode,
      options: collectTransferOptions({
        departuresByStopId,
        mode: selectedMode,
        nodes: modeNodes,
        stopIds: memberStopIds,
        stopName: primary?.name || modeNodes[0]?.stop.name || "",
      }),
    };
    context.header("Cache-Control", "no-store");
    return context.json(payload, 200);
  });
}
