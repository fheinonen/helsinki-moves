import type { Hono } from "hono";

interface NodeRequestLike {
  headers: Record<string, string | string[] | undefined>;
  method?: string;
  on(event: "data", listener: (chunk: Buffer) => void): void;
  on(event: "end", listener: () => void): void;
  url?: string;
}

interface NodeResponseLike {
  end(chunk?: string | Buffer): void;
  setHeader(name: string, value: string | number | readonly string[]): void;
  write(chunk: string | Buffer): void;
  writeHead(status: number, headers: Record<string, string | number | readonly string[]>): void;
}

type NextFunction = () => void | Promise<void>;

function shouldHandleDevApiRequest(url: string | undefined): boolean {
  return typeof url === "string" && url.startsWith("/api/");
}

async function readRequestBody(request: NodeRequestLike): Promise<Buffer | undefined> {
  const chunks: Buffer[] = [];
  await new Promise<void>((resolve) => {
    request.on("data", (chunk) => {
      chunks.push(chunk);
    });
    request.on("end", () => {
      resolve();
    });
  });
  if (chunks.length === 0) {
    return undefined;
  }
  return Buffer.concat(chunks);
}

async function toFetchRequest(request: NodeRequestLike): Promise<Request> {
  const host = request.headers.host || "127.0.0.1:4173";
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (typeof value === "string") {
      headers.set(name, value);
      continue;
    }
    if (Array.isArray(value)) {
      for (const entry of value) {
        headers.append(name, entry);
      }
    }
  }

  return new Request(`http://${host}${request.url || "/"}`, {
    body:
      request.method && request.method !== "GET" && request.method !== "HEAD"
        ? ((await readRequestBody(request)) as unknown as BodyInit | undefined)
        : undefined,
    headers,
    method: request.method || "GET",
  });
}

async function writeFetchResponse(
  response: Response,
  target: NodeResponseLike
): Promise<void> {
  const headers: Record<string, string> = {};
  response.headers.forEach((value, name) => {
    headers[name] = value;
  });

  const body = Buffer.from(await response.arrayBuffer());
  target.writeHead(response.status, headers);
  target.end(body);
}

export function createDevApiMiddleware(input: { app: Hono }) {
  return async (
    request: NodeRequestLike,
    response: NodeResponseLike,
    next: NextFunction
  ): Promise<void> => {
    if (!shouldHandleDevApiRequest(request.url)) {
      await next();
      return;
    }

    const fetchRequest = await toFetchRequest(request);
    const fetchResponse = await input.app.fetch(fetchRequest);
    await writeFetchResponse(fetchResponse, response);
  };
}
