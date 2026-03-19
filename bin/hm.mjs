#!/usr/bin/env node
// hm — Helsinki Moves CLI
// Query transit departures from the terminal.
//
// Data flow:
//   parseArgs → geocode(query) → departures(lat,lon) → format → stdout
//
//   --stop adds a second departures call with stopId for precision.
//   --all queries all four modes in parallel and merges results.

import { parseArgs } from "node:util";

const BASE = process.env.HM_API_URL || "https://helsinkimoves.fheinonen.eu";
const MODES = ["bus", "tram", "rail", "metro"];
const TIME_RELATIVE_THRESHOLD_MIN = 15;

// ── Helpers ──────────────────────────────────────────────────────────

function die(msg, code = 2) {
  console.error(msg);
  return code;
}

function printHelp() {
  console.log(`hm — Helsinki Moves CLI

Usage: hm [OPTIONS]

Options:
  --location, -l <text>    Address or place name
  --stop, -s <text>        Stop name (precise single-stop results)
  --line, -n <number>      Filter to line(s), comma-separated
  --mode, -m <mode>        Transit mode: bus, tram, rail, metro (default: bus)
  --all, -a                Show all transit modes (overrides --mode)
  --results, -r <count>    Number of departures
  --json                   Output as JSON
  --help, -h               Show this help

Examples:
  hm -l "Vihdintie 17"
  hm -l "Vihdintie 17" --line 57
  hm --stop Talontie
  hm -l Kamppi -m tram
  hm -l Pasila --all
  hm -l Pasila -m rail --json | jq '.[]'`);
  return 0;
}

async function fetchApi(path, params) {
  const url = new URL(path, BASE);
  for (const [k, v] of Object.entries(params)) {
    if (v != null) url.searchParams.set(k, String(v));
  }
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`API error (${res.status})${body ? ": " + body : ""}`);
  }
  return res.json();
}

// ── Geocode ──────────────────────────────────────────────────────────

async function geocode(query, json) {
  const data = await fetchApi("/api/v1/geocode", { q: query });
  if (data.ambiguous) {
    if (json) {
      console.log(JSON.stringify({ ambiguous: true, choices: data.choices }));
    } else {
      console.error(`Multiple matches for "${query}":`);
      data.choices.forEach((c, i) => {
        const conf = c.confidence != null ? ` (${c.confidence.toFixed(2)})` : "";
        console.error(`  ${i + 1}. ${c.label}${conf}`);
      });
      console.error(`\nUse a more specific query: hm -l "${data.choices[0]?.label}"`);
    }
    return null;
  }
  if (!data.location) {
    console.error(`No location found for '${query}'. Try a more specific address.`);
    return null;
  }
  return data.location;
}

// ── Departures ───────────────────────────────────────────────────────

async function getDepartures(lat, lon, opts) {
  const params = { lat, lon, mode: opts.mode.toUpperCase() };
  if (opts.line) params.line = opts.line;
  if (opts.results) params.results = opts.results;
  if (opts.stopId) params.stopId = opts.stopId;
  return fetchApi("/api/v1/departures", params);
}

async function getStopDepartures(lat, lon, opts) {
  const first = await getDepartures(lat, lon, opts);
  if (!first.stops?.length) return first;
  const nearest = first.stops[0];
  return getDepartures(lat, lon, { ...opts, stopId: nearest.id });
}

async function getAllDepartures(lat, lon, opts) {
  const results = await Promise.allSettled(
    MODES.map((m) => getDepartures(lat, lon, { ...opts, mode: m })),
  );
  const departures = [];
  const warnings = [];
  for (let i = 0; i < MODES.length; i++) {
    const r = results[i];
    if (r.status === "fulfilled" && r.value.station?.departures?.length) {
      for (const d of r.value.station.departures) {
        departures.push({ ...d, _mode: MODES[i] });
      }
    } else if (r.status === "rejected") {
      warnings.push(MODES[i]);
    }
  }
  departures.sort((a, b) => a.departureIso.localeCompare(b.departureIso));
  return { departures, warnings };
}

// ── Formatting ───────────────────────────────────────────────────────

function formatTime(isoString) {
  const dep = new Date(isoString);
  const now = new Date();
  const diffMin = Math.round((dep - now) / 60000);
  if (diffMin < 0) return "now";
  if (diffMin < TIME_RELATIVE_THRESHOLD_MIN) return `${diffMin} min`;
  return dep.toLocaleTimeString("fi-FI", { hour: "2-digit", minute: "2-digit" });
}

function formatTable(departures, heading) {
  if (heading) console.log(heading);
  if (!departures.length) return;
  const rows = departures.map((d) => [
    d._mode?.toUpperCase() || "",
    d.line,
    d.destination,
    formatTime(d.departureIso),
    d.stopCode ? `${d.stopName || ""} (${d.stopCode})` : d.stopName || "",
  ]);
  const hasMode = rows.some((r) => r[0]);
  const headers = hasMode
    ? ["MODE", "LINE", "DEST", "DEPARTS", "STOP"]
    : ["LINE", "DEST", "DEPARTS", "STOP"];
  const data = hasMode ? rows : rows.map((r) => r.slice(1));
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...data.map((r) => (r[i] || "").length)),
  );
  console.log("  " + headers.map((h, i) => h.padEnd(widths[i])).join("  "));
  for (const row of data) {
    console.log("  " + row.map((c, i) => (c || "").padEnd(widths[i])).join("  "));
  }
}

// ── Main ─────────────────────────────────────────────────────────────

async function main() {
  let values, positionals;
  try {
    ({ values, positionals } = parseArgs({
      strict: true,
      allowPositionals: true,
      options: {
        location: { type: "string", short: "l" },
        stop: { type: "string", short: "s" },
        line: { type: "string", short: "n" },
        mode: { type: "string", short: "m" },
        all: { type: "boolean", short: "a", default: false },
        results: { type: "string", short: "r" },
        json: { type: "boolean", default: false },
        help: { type: "boolean", short: "h", default: false },
      },
    }));
  } catch {
    return die(
      'Tip: quote multi-word locations: hm -l "Vihdintie 17"\nRun hm --help for usage.',
    );
  }

  if (values.help) return printHelp();

  if (positionals.length > 0) {
    return die(
      `Unexpected argument: "${positionals[0]}"\nTip: quote multi-word locations: hm -l "Vihdintie 17"`,
    );
  }

  const query = values.location || values.stop;
  if (!query) return die("Missing --location or --stop. Run hm --help for usage.");

  if (values.mode && !MODES.includes(values.mode)) {
    return die(`Invalid mode "${values.mode}". Valid: ${MODES.join(", ")}`);
  }

  const mode = values.mode || "bus";
  const useStop = Boolean(values.stop);
  const useAll = values.all;
  const json = values.json;
  const opts = {
    mode,
    line: values.line || null,
    results: values.results || null,
    stopId: null,
  };

  let location;
  try {
    location = await geocode(query, json);
  } catch (e) {
    return die(`Could not reach Helsinki Moves API. ${e.message}`);
  }
  if (!location) return 1;

  const { latitude: lat, longitude: lon } = location;

  try {
    if (useAll) {
      const { departures, warnings } = await getAllDepartures(lat, lon, opts);
      for (const w of warnings) {
        console.error(`Warning: ${w} departures unavailable`);
      }
      if (json) {
        console.log(JSON.stringify(departures));
        return departures.length > 0 ? 0 : 1;
      }
      const heading = `${location.label} — All departures`;
      formatTable(departures, heading);
      return departures.length > 0 ? 0 : die(`No upcoming departures at ${location.label}.`, 1);
    }

    let data;
    if (useStop) {
      data = await getStopDepartures(lat, lon, opts);
    } else {
      data = await getDepartures(lat, lon, opts);
    }

    const departures = data.station?.departures || [];
    if (json) {
      console.log(JSON.stringify(departures));
      return departures.length > 0 ? 0 : 1;
    }

    const modeLabel = mode.charAt(0).toUpperCase() + mode.slice(1);
    const stopLabel = data.station?.stopName ? ` — ${data.station.stopName}` : "";
    const heading = `${location.label}${stopLabel} — ${modeLabel} departures`;
    formatTable(departures, heading);
    if (!departures.length) {
      return die(`No upcoming departures at ${location.label} (${mode}).`, 1);
    }
    return 0;
  } catch (e) {
    return die(`Could not reach Helsinki Moves API. ${e.message}`);
  }
}

// ── Entry point ──────────────────────────────────────────────────────

process.exit(await main());
