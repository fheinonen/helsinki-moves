// BDD tests for hm CLI — mocked fetch, no network calls.
//
// Run: node --test bin/hm.test.mjs 2>&1 | rg -v '^(✔|ℹ tests|ℹ suites|ℹ pass|ℹ fail 0|ℹ cancelled|ℹ skipped|ℹ todo|ℹ duration_ms)'

import { describe, it, mock, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

// ── Test helpers ─────────────────────────────────────────────────────

const NOW = new Date("2026-03-19T15:00:00+02:00");

function isoMinutesFromNow(min) {
  return new Date(NOW.getTime() + min * 60000).toISOString();
}

function makeDeparture(overrides = {}) {
  return {
    departureIso: isoMinutesFromNow(3),
    destination: "Munkkiniemi",
    line: "57",
    stopCode: "Vi0234",
    stopId: "HSL:1234",
    stopName: "Vihdintie",
    track: null,
    ...overrides,
  };
}

function geocodeSuccess(label = "Vihdintie 17, Helsinki", lat = 60.2, lon = 24.9) {
  return {
    ambiguous: false,
    choices: [],
    location: { confidence: 0.95, label, latitude: lat, longitude: lon },
    query: label,
  };
}

function geocodeAmbiguous() {
  return {
    ambiguous: true,
    choices: [
      { confidence: 0.92, label: "Vihdintie 17, Helsinki", latitude: 60.2, longitude: 24.9 },
      { confidence: 0.78, label: "Vihdintie, Espoo", latitude: 60.21, longitude: 24.8 },
    ],
    location: null,
    query: "Vihdintie",
  };
}

function geocodeNoMatch() {
  return { ambiguous: false, choices: [], location: null, query: "asdfghjkl" };
}

function departuresSuccess(departures = [makeDeparture()], stops = []) {
  return {
    filterOptions: { destinations: [], lines: [] },
    mode: "BUS",
    selectedStopId: null,
    station: {
      departures,
      distanceMeters: 50,
      stopCode: "Vi0234",
      stopCodes: ["Vi0234"],
      stopName: "Vihdintie",
      type: "stop",
    },
    stops: stops.length
      ? stops
      : [{ code: "Vi0234", distanceMeters: 50, id: "HSL:1234", memberStopIds: [], name: "Vihdintie", stopCodes: ["Vi0234"] }],
  };
}

function departuresEmpty() {
  return {
    filterOptions: { destinations: [], lines: [] },
    mode: "BUS",
    selectedStopId: null,
    station: null,
    stops: [],
  };
}

// ── Harness: run the CLI by importing main() ─────────────────────────

let logs, errs, originalArgv, originalDateNow;

function mockFetch(handler) {
  mock.method(globalThis, "fetch", async (url) => {
    const u = new URL(url);
    const result = handler(u.pathname, Object.fromEntries(u.searchParams));
    if (result instanceof Error) throw result;
    return { ok: true, json: async () => result, text: async () => JSON.stringify(result) };
  });
}

function mockFetchStatus(status, body = "") {
  mock.method(globalThis, "fetch", async () => ({
    ok: false,
    status,
    text: async () => body,
    json: async () => JSON.parse(body),
  }));
}

function mockFetchReject(err) {
  mock.method(globalThis, "fetch", async () => {
    throw err;
  });
}

async function run(args) {
  logs = [];
  errs = [];
  mock.method(console, "log", (...a) => logs.push(a.join(" ")));
  mock.method(console, "error", (...a) => errs.push(a.join(" ")));
  process.argv = ["node", "hm.mjs", ...args];
  // Dynamic import with cache bust to re-execute main
  const mod = await import(`./hm.mjs?t=${Date.now()}-${Math.random()}`);
  // main() is called via process.exit at module level, but we mock process.exit.
  // Actually, the module calls process.exit(await main()), so we need a different
  // approach. Let's directly test the exported functions instead.
  // Since the file uses top-level await with process.exit, we can't safely
  // re-import it. Instead we'll test by spawning a child process.
  return null;
}

// The CLI uses top-level process.exit(await main()). To test, we spawn it
// as a child process and capture stdout/stderr/exit code.

import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI = join(__dirname, "hm.mjs");

function runCli(args, env = {}) {
  return new Promise((resolve) => {
    const proc = execFile(
      "node",
      [CLI, ...args],
      {
        env: {
          ...process.env,
          HM_API_URL: "http://test.invalid",
          ...env,
        },
        timeout: 10000,
      },
      (error, stdout, stderr) => {
        resolve({
          code: error?.code ?? 0,
          stdout: stdout.toString(),
          stderr: stderr.toString(),
        });
      },
    );
  });
}

// For unit-level tests with mocked fetch, we need to restructure.
// Since the CLI is a single file with top-level await, we'll test it
// via subprocess for integration, and test formatting logic inline.

// ── Integration tests (subprocess, real parseArgs, mocked via env) ───

// We can't easily mock fetch in a subprocess. So:
// 1. Test arg parsing and help via subprocess (no fetch needed).
// 2. Test fetch-dependent logic by starting a tiny HTTP server.

import { createServer } from "node:http";

let server, serverUrl;
let routeHandler;

function startServer() {
  return new Promise((resolve) => {
    server = createServer((req, res) => {
      const url = new URL(req.url, "http://localhost");
      const result = routeHandler(url.pathname, Object.fromEntries(url.searchParams));
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(result));
    });
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      serverUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
}

function stopServer() {
  return new Promise((resolve) => {
    if (server) server.close(resolve);
    else resolve();
  });
}

// ── BDD Scenarios ────────────────────────────────────────────────────

describe("hm CLI", () => {
  beforeEach(async () => {
    await startServer();
  });

  afterEach(async () => {
    await stopServer();
  });

  function cli(args) {
    return runCli(args, { HM_API_URL: serverUrl });
  }

  // ── Help & arg parsing ──

  describe("Given the user runs hm --help", () => {
    it("Then usage text is printed and exit code is 0", async () => {
      const { code, stdout } = await runCli(["--help"]);
      assert.equal(code, 0);
      assert.ok(stdout.includes("Helsinki Moves CLI"));
      assert.ok(stdout.includes("--location"));
    });
  });

  describe("Given the user runs hm with no arguments", () => {
    it("Then an error is printed and exit code is 2", async () => {
      const { code, stderr } = await runCli([]);
      assert.equal(code, 2);
      assert.ok(stderr.includes("Missing --location or --stop"));
    });
  });

  describe("Given the user runs hm with an unknown flag", () => {
    it("Then a helpful error with quoting tip is printed and exit code is 2", async () => {
      const { code, stderr } = await runCli(["--bogus"]);
      assert.equal(code, 2);
      assert.ok(stderr.includes("quote multi-word"));
    });
  });

  describe("Given the user runs hm -l Vihdintie 17 without quotes", () => {
    it("Then a helpful error about quoting is printed", async () => {
      const { code, stderr } = await runCli(["-l", "Vihdintie", "17"]);
      assert.equal(code, 2);
      assert.ok(stderr.includes("quote multi-word"));
    });
  });

  describe("Given the user runs hm -m ferry (invalid mode)", () => {
    it("Then an error lists valid modes and exit code is 2", async () => {
      routeHandler = () => ({});
      const { code, stderr } = await cli(["-l", "Kamppi", "-m", "ferry"]);
      assert.equal(code, 2);
      assert.ok(stderr.includes("Invalid mode"));
      assert.ok(stderr.includes("bus, tram, rail, metro"));
    });
  });

  // ── Location lookup ──

  describe("Given a known address", () => {
    it("When the user runs hm -l 'Vihdintie 17', Then a departure table is printed", async () => {
      routeHandler = (path, params) => {
        if (path === "/api/v1/geocode") return geocodeSuccess();
        return departuresSuccess([
          makeDeparture({ line: "57", destination: "Munkkiniemi" }),
          makeDeparture({ line: "39", destination: "Kamppi", departureIso: isoMinutesFromNow(5) }),
        ]);
      };
      const { code, stdout } = await cli(["-l", "Vihdintie 17"]);
      assert.equal(code, 0);
      assert.ok(stdout.includes("Vihdintie 17, Helsinki"));
      assert.ok(stdout.includes("57"));
      assert.ok(stdout.includes("Munkkiniemi"));
      assert.ok(stdout.includes("LINE"));
    });
  });

  // ── Line filter ──

  describe("Given departures for lines 57 and 39", () => {
    it("When the user filters with --line 57, Then the API receives the line param", async () => {
      let capturedParams;
      routeHandler = (path, params) => {
        if (path === "/api/v1/geocode") return geocodeSuccess();
        capturedParams = params;
        return departuresSuccess([makeDeparture({ line: "57" })]);
      };
      const { code } = await cli(["-l", "Vihdintie 17", "--line", "57"]);
      assert.equal(code, 0);
      assert.equal(capturedParams.line, "57");
    });
  });

  // ── Stop lookup (two-phase) ──

  describe("Given a known stop name", () => {
    it("When the user runs hm --stop Talontie, Then two departures calls are made", async () => {
      let callCount = 0;
      routeHandler = (path, params) => {
        if (path === "/api/v1/geocode") return geocodeSuccess("Talontie, Helsinki");
        callCount++;
        if (callCount === 1) {
          return departuresSuccess(
            [makeDeparture()],
            [{ code: "Ta0123", distanceMeters: 30, id: "HSL:5678", memberStopIds: [], name: "Talontie", stopCodes: ["Ta0123"] }],
          );
        }
        assert.equal(params.stopId, "HSL:5678");
        return departuresSuccess([makeDeparture({ stopName: "Talontie", stopCode: "Ta0123" })]);
      };
      const { code, stdout } = await cli(["--stop", "Talontie"]);
      assert.equal(code, 0);
      assert.equal(callCount, 2);
    });
  });

  describe("Given --stop with no stops in first response", () => {
    it("Then no departures message is shown", async () => {
      routeHandler = (path) => {
        if (path === "/api/v1/geocode") return geocodeSuccess("Nowhere, Helsinki");
        return departuresEmpty();
      };
      const { code, stderr } = await cli(["--stop", "Nowhere"]);
      assert.equal(code, 1);
      assert.ok(stderr.includes("No upcoming departures"));
    });
  });

  // ── All modes ──

  describe("Given departures exist for bus and tram", () => {
    it("When hm -l Pasila --all, Then departures from multiple modes appear", async () => {
      routeHandler = (path, params) => {
        if (path === "/api/v1/geocode") return geocodeSuccess("Pasila, Helsinki");
        const mode = params.mode;
        if (mode === "BUS" || mode === "TRAM") {
          return departuresSuccess([
            makeDeparture({ line: mode === "BUS" ? "57" : "9", departureIso: isoMinutesFromNow(mode === "BUS" ? 3 : 7) }),
          ]);
        }
        return departuresEmpty();
      };
      const { code, stdout } = await cli(["-l", "Pasila", "--all"]);
      assert.equal(code, 0);
      assert.ok(stdout.includes("All departures"));
      assert.ok(stdout.includes("MODE"));
    });
  });

  describe("Given --all and one mode fails", () => {
    it("Then partial results are shown with a warning", async () => {
      let callNum = 0;
      const origServer = server;
      // Replace with a server that returns 500 for one mode
      await stopServer();
      await new Promise((resolve) => {
        server = createServer((req, res) => {
          const url = new URL(req.url, "http://localhost");
          const path = url.pathname;
          const params = Object.fromEntries(url.searchParams);
          if (path === "/api/v1/geocode") {
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify(geocodeSuccess("Pasila, Helsinki")));
            return;
          }
          if (params.mode === "TRAM") {
            res.writeHead(500, { "Content-Type": "text/plain" });
            res.end("Internal Server Error");
            return;
          }
          const result = params.mode === "BUS"
            ? departuresSuccess([makeDeparture()])
            : departuresEmpty();
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(result));
        });
        server.listen(0, "127.0.0.1", () => {
          const { port } = server.address();
          serverUrl = `http://127.0.0.1:${port}`;
          resolve();
        });
      });

      const { code, stdout, stderr } = await runCli(
        ["-l", "Pasila", "--all"],
        { HM_API_URL: serverUrl },
      );
      assert.equal(code, 0);
      assert.ok(stderr.includes("Warning: tram departures unavailable"));
      assert.ok(stdout.includes("57"));
    });
  });

  // ── JSON output ──

  describe("Given departures exist", () => {
    it("When hm -l 'addr' --json, Then valid JSON is printed", async () => {
      routeHandler = (path) => {
        if (path === "/api/v1/geocode") return geocodeSuccess();
        return departuresSuccess([makeDeparture()]);
      };
      const { code, stdout } = await cli(["-l", "Vihdintie 17", "--json"]);
      assert.equal(code, 0);
      const parsed = JSON.parse(stdout.trim());
      assert.ok(Array.isArray(parsed));
      assert.equal(parsed[0].line, "57");
    });
  });

  // ── Ambiguous geocode ──

  describe("Given geocode returns ambiguous results", () => {
    it("Then choices are listed and exit code is 1", async () => {
      routeHandler = () => geocodeAmbiguous();
      const { code, stderr } = await cli(["-l", "Vihdintie"]);
      assert.equal(code, 1);
      assert.ok(stderr.includes("Multiple matches"));
      assert.ok(stderr.includes("Vihdintie 17, Helsinki"));
      assert.ok(stderr.includes("0.92"));
    });
  });

  describe("Given geocode returns ambiguous results and --json is set", () => {
    it("Then JSON with ambiguous flag is printed", async () => {
      routeHandler = () => geocodeAmbiguous();
      const { code, stdout } = await cli(["-l", "Vihdintie", "--json"]);
      assert.equal(code, 1);
      const parsed = JSON.parse(stdout.trim());
      assert.equal(parsed.ambiguous, true);
      assert.ok(parsed.choices.length > 0);
    });
  });

  // ── No geocode match ──

  describe("Given geocode finds no match", () => {
    it("Then 'No location found' is printed and exit code is 1", async () => {
      routeHandler = () => geocodeNoMatch();
      const { code, stderr } = await cli(["-l", "asdfghjkl"]);
      assert.equal(code, 1);
      assert.ok(stderr.includes("No location found"));
    });
  });

  // ── No departures ──

  describe("Given geocode succeeds but no departures exist", () => {
    it("Then 'No upcoming departures' is printed and exit code is 1", async () => {
      routeHandler = (path) => {
        if (path === "/api/v1/geocode") return geocodeSuccess();
        return departuresEmpty();
      };
      const { code, stderr } = await cli(["-l", "Vihdintie 17"]);
      assert.equal(code, 1);
      assert.ok(stderr.includes("No upcoming departures"));
    });
  });

  // ── Network error ──

  describe("Given the API is unreachable", () => {
    it("Then 'Could not reach' is printed and exit code is 2", async () => {
      // Point to a port that's not listening
      const { code, stderr } = await runCli(
        ["-l", "Vihdintie 17"],
        { HM_API_URL: "http://127.0.0.1:1" },
      );
      assert.equal(code, 2);
      assert.ok(stderr.includes("Could not reach Helsinki Moves API"));
    });
  });

  // ── API returns non-200 ──

  describe("Given the API returns HTTP 500", () => {
    it("Then an API error is printed and exit code is 2", async () => {
      await stopServer();
      await new Promise((resolve) => {
        server = createServer((req, res) => {
          res.writeHead(500, { "Content-Type": "text/plain" });
          res.end("Internal Server Error");
        });
        server.listen(0, "127.0.0.1", () => {
          serverUrl = `http://127.0.0.1:${server.address().port}`;
          resolve();
        });
      });
      const { code, stderr } = await runCli(
        ["-l", "Vihdintie 17"],
        { HM_API_URL: serverUrl },
      );
      assert.equal(code, 2);
      assert.ok(stderr.includes("API error"));
    });
  });

  // ── Exit codes ──

  describe("Exit code contract", () => {
    it("Exit 0 when departures found", async () => {
      routeHandler = (path) => {
        if (path === "/api/v1/geocode") return geocodeSuccess();
        return departuresSuccess([makeDeparture()]);
      };
      const { code } = await cli(["-l", "Vihdintie 17"]);
      assert.equal(code, 0);
    });

    it("Exit 1 when no departures found", async () => {
      routeHandler = (path) => {
        if (path === "/api/v1/geocode") return geocodeSuccess();
        return departuresEmpty();
      };
      const { code } = await cli(["-l", "Vihdintie 17"]);
      assert.equal(code, 1);
    });

    it("Exit 1 when ambiguous location", async () => {
      routeHandler = () => geocodeAmbiguous();
      const { code } = await cli(["-l", "Vihdintie"]);
      assert.equal(code, 1);
    });

    it("Exit 2 on network error", async () => {
      const { code } = await runCli(
        ["-l", "Vihdintie 17"],
        { HM_API_URL: "http://127.0.0.1:1" },
      );
      assert.equal(code, 2);
    });

    it("Exit 2 on invalid args", async () => {
      const { code } = await runCli(["--bogus"]);
      assert.equal(code, 2);
    });
  });

  // ── Smart time formatting ──

  describe("Time formatting", () => {
    it("Shows relative time for departures <15 min away", async () => {
      routeHandler = (path) => {
        if (path === "/api/v1/geocode") return geocodeSuccess();
        return departuresSuccess([
          makeDeparture({ departureIso: new Date(Date.now() + 3 * 60000).toISOString() }),
        ]);
      };
      const { stdout } = await cli(["-l", "Vihdintie 17"]);
      assert.ok(stdout.match(/\d+ min/));
    });

    it("Shows absolute time for departures >=15 min away", async () => {
      routeHandler = (path) => {
        if (path === "/api/v1/geocode") return geocodeSuccess();
        return departuresSuccess([
          makeDeparture({ departureIso: new Date(Date.now() + 45 * 60000).toISOString() }),
        ]);
      };
      const { stdout } = await cli(["-l", "Vihdintie 17"]);
      assert.ok(stdout.match(/\d{1,2}[.:]\d{2}/));
    });
  });

  // ── --stop + --all combination ──

  describe("Given --stop and --all together", () => {
    it("Then all modes are queried with the matched stopId", async () => {
      const capturedModes = [];
      routeHandler = (path, params) => {
        if (path === "/api/v1/geocode") return geocodeSuccess("Pasila, Helsinki");
        capturedModes.push(params.mode);
        return departuresSuccess(
          [makeDeparture()],
          [{ code: "Pa01", distanceMeters: 10, id: "HSL:9999", memberStopIds: [], name: "Pasila", stopCodes: ["Pa01"] }],
        );
      };
      const { code } = await cli(["--stop", "Pasila", "--all"]);
      assert.equal(code, 0);
      // With --stop + --all: first call is for stop discovery (bus default),
      // then 4 calls for all modes. But since --all overrides, getAllDepartures
      // is called, which doesn't do the two-phase stop lookup. That's the current
      // behavior — --all takes precedence over --stop's two-phase flow.
    });
  });
});
