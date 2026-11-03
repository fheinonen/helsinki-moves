import type { Hono } from "hono";

const TILE_ENDPOINT = "https://cdn.digitransit.fi/map/v3/hsl-map";
const TILE_TIMEOUT_MS = 7000;

interface TileCoords {
  x: number;
  y: number;
  z: number;
}

interface MapTileRouteOptions {
  fetchImpl?: typeof fetch;
  getApiKey?: () => string | undefined;
}

function integerParam(value: string | null): number | null {
  if (!value || !/^\d+$/.test(value)) {
    return null;
  }
  return Number(value);
}

function readTileCoords(params: URLSearchParams): TileCoords | null {
  const z = integerParam(params.get("z"));
  const x = integerParam(params.get("x"));
  const y = integerParam(params.get("y"));
  if (z == null || x == null || y == null || z > 19) {
    return null;
  }
  const scale = 2 ** z;
  if (x >= scale || y >= scale) {
    return null;
  }
  return { x, y, z };
}

function missingTile(): Response {
  return Response.json({ error: "not found" }, { status: 404 });
}

async function fetchStreetTile(input: {
  apiKey: string;
  coords: TileCoords;
  fetchImpl: typeof fetch;
}): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TILE_TIMEOUT_MS);
  try {
    const upstream = await input.fetchImpl(
      `${TILE_ENDPOINT}/${input.coords.z}/${input.coords.x}/${input.coords.y}.png`,
      {
        headers: {
          "digitransit-subscription-key": input.apiKey,
          "user-agent": "HelsinkiMoves/1.0",
        },
        signal: controller.signal,
      },
    );
    const type = upstream.headers.get("content-type") || "";
    if (!upstream.ok || !type.includes("image/")) {
      return Response.json({ error: "not found" }, { status: 502 });
    }
    return new Response(await upstream.arrayBuffer(), {
      headers: {
        "cache-control": "public, max-age=86400",
        "content-type": "image/png",
      },
      status: 200,
    });
  } catch {
    return Response.json({ error: "not found" }, { status: 502 });
  } finally {
    clearTimeout(timeout);
  }
}

export function registerMapTileRoute(app: Hono, options: MapTileRouteOptions = {}): void {
  const fetchImpl = options.fetchImpl || fetch;
  const getApiKey = options.getApiKey || (() => process.env.DIGITRANSIT_API_KEY);

  app.get("/api/v1/map-tile", async (context) => {
    const coords = readTileCoords(new URL(context.req.url).searchParams);
    const apiKey = getApiKey();
    if (!coords || !apiKey) {
      return missingTile();
    }
    return fetchStreetTile({ apiKey, coords, fetchImpl });
  });
}
