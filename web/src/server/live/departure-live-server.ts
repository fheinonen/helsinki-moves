import { createServer, type Server } from "node:http";
import { WebSocket, WebSocketServer } from "ws";
import type { DeparturesRequest } from "../../shared/contracts/departures-contract.js";
import type { Departure } from "../../shared/domain/departure.js";
import { validateDeparturesRequest } from "../validation/departures-schema.js";
import { createDigitransitService } from "../services/digitransit/client.js";
import { DeparturesService } from "../services/digitransit/departures-service.js";
import type { DigitransitService } from "../services/digitransit/types.js";
import { startDepartureLiveSession } from "./departure-live-session.js";

const LIVE_POLL_MS = 10_000;

export interface DepartureLiveServerOptions {
  digitransitService?: DigitransitService;
  now?: () => number;
  pollMs?: number;
}

async function loadVisibleDepartures(
  service: DeparturesService,
  request: DeparturesRequest,
): Promise<readonly Departure[]> {
  const payload = await service.execute(request);
  return payload.station?.departures ?? [];
}

export function createDepartureLiveServer(options: DepartureLiveServerOptions = {}): Server {
  const digitransitService = options.digitransitService ?? createDigitransitService();
  const now = options.now ?? Date.now;
  const pollMs = options.pollMs ?? LIVE_POLL_MS;
  const server = createServer((_request, response) => {
    response.writeHead(426, { "content-type": "text/plain; charset=utf-8" });
    response.end("websocket required");
  });
  const sockets = new WebSocketServer({ server });

  sockets.on("connection", (socket, request) => {
    const requestUrl = new URL(request.url ?? "/", "http://localhost");
    const validation = validateDeparturesRequest(requestUrl.searchParams);
    if (!validation.ok) {
      socket.close(1008);
      return;
    }

    const departures = new DeparturesService(digitransitService, now);
    const session = startDepartureLiveSession({
      loadBoard: () => loadVisibleDepartures(departures, validation.value),
      pollMs,
      send(message) {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(message);
        }
      },
    });
    const stop = () => session.stop();
    socket.on("close", stop);
    socket.on("error", stop);
  });

  server.on("close", () => {
    sockets.close();
  });

  return server;
}
