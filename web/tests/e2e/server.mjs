import http from "node:http";
import path from "node:path";
import { stat } from "node:fs/promises";
import { createReadStream } from "node:fs";

const host = process.env.HOST || "127.0.0.1";
const port = Number(process.env.PORT || 4173);
const rootDir = process.cwd();

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
};

function resolvePath(requestPath) {
  const decoded = decodeURIComponent(requestPath);
  const normalized = path.normalize(decoded).replace(/^\/+/, "");
  const candidate = normalized === "" ? "index.html" : normalized;
  const absolute = path.resolve(rootDir, candidate);

  if (!absolute.startsWith(rootDir)) {
    return null;
  }

  return absolute;
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "content-length": Buffer.byteLength(body),
  });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  const method = req.method || "GET";
  const url = new URL(req.url || "/", `http://${host}:${port}`);

  if (url.pathname.startsWith("/api/")) {
    sendJson(res, 404, { error: "Not found" });
    return;
  }

  if (method !== "GET" && method !== "HEAD") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  let absolutePath = resolvePath(url.pathname);
  if (!absolutePath) {
    sendJson(res, 400, { error: "Invalid path" });
    return;
  }

  try {
    let stats = await stat(absolutePath);

    if (stats.isDirectory()) {
      absolutePath = path.join(absolutePath, "index.html");
      stats = await stat(absolutePath);
    }

    const ext = path.extname(absolutePath).toLowerCase();
    const contentType = contentTypes[ext] || "application/octet-stream";

    res.writeHead(200, {
      "content-type": contentType,
      "cache-control": "no-store",
      "content-length": stats.size,
    });

    if (method === "HEAD") {
      res.end();
      return;
    }

    createReadStream(absolutePath).pipe(res);
  } catch {
    sendJson(res, 404, { error: "Not found" });
  }
});

server.listen(port, host, () => {
  process.stdout.write(`E2E static server listening on http://${host}:${port}\n`);
});

function shutdown() {
  server.close(() => {
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
