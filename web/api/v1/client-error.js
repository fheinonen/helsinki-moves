const MAX_BODY_SIZE = 8000;
const MAX_CONTEXT_DEPTH = 3;
const MAX_CONTEXT_KEYS = 30;
const MAX_CONTEXT_ARRAY_ITEMS = 30;
const MAX_CONTEXT_STRING_LENGTH = 200;

function safeString(value, maxLength) {
  const text = String(value || "");
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength);
}

function isPlainObject(value) {
  return Object.prototype.toString.call(value) === "[object Object]";
}

function sanitizeContext(value, depth = 0) {
  if (value == null) return null;

  if (typeof value === "string") {
    return safeString(value, MAX_CONTEXT_STRING_LENGTH);
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (depth >= MAX_CONTEXT_DEPTH) {
    return "[Truncated]";
  }

  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_CONTEXT_ARRAY_ITEMS)
      .map((item) => sanitizeContext(item, depth + 1));
  }

  if (isPlainObject(value)) {
    const entries = Object.entries(value);
    const limitedEntries = entries.slice(0, MAX_CONTEXT_KEYS);
    const result = {};

    for (const [rawKey, rawValue] of limitedEntries) {
      const key = safeString(rawKey, 60);
      result[key] = sanitizeContext(rawValue, depth + 1);
    }

    if (entries.length > MAX_CONTEXT_KEYS) {
      result._truncated = true;
    }

    return result;
  }

  return safeString(value, MAX_CONTEXT_STRING_LENGTH);
}

function getPayloadByteSize(payload) {
  try {
    return Buffer.byteLength(JSON.stringify(payload), "utf8");
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

function sanitizePayload(payload) {
  if (!isPlainObject(payload)) return null;

  return {
    type: safeString(payload.type, 40),
    message: safeString(payload.message, 400),
    stack: safeString(payload.stack, 1200),
    url: safeString(payload.url, 500),
    userAgent: safeString(payload.userAgent, 300),
    timestamp: safeString(payload.timestamp, 40),
    context: sanitizeContext(payload.context),
  };
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";

    req.on("data", (chunk) => {
      data += chunk;
      if (Buffer.byteLength(data, "utf8") > MAX_BODY_SIZE) {
        reject(new Error("Payload too large"));
        req.destroy();
      }
    });

    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    let payload = req.body;

    if (!payload || typeof payload === "string") {
      const raw = typeof payload === "string" ? payload : await readBody(req);
      if (!raw) {
        return res.status(400).json({ error: "Invalid payload" });
      }
      if (Buffer.byteLength(raw, "utf8") > MAX_BODY_SIZE) {
        return res.status(413).json({ error: "Payload too large" });
      }
      payload = JSON.parse(raw);
    }

    if (getPayloadByteSize(payload) > MAX_BODY_SIZE) {
      return res.status(413).json({ error: "Payload too large" });
    }

    const sanitized = sanitizePayload(payload);
    if (!sanitized) {
      return res.status(400).json({ error: "Invalid payload" });
    }

    if (getPayloadByteSize(sanitized) > MAX_BODY_SIZE) {
      return res.status(413).json({ error: "Payload too large" });
    }

    console.error("client error report:", sanitized);
    return res.status(204).end();
  } catch (error) {
    if (error?.message === "Payload too large") {
      return res.status(413).json({ error: "Payload too large" });
    }
    console.error("client error report failed:", error);
    return res.status(400).json({ error: "Invalid payload" });
  }
};
