const MIN_QUERY_LENGTH = 3;
const MAX_QUERY_LENGTH = 140;
const MAX_LANG_LENGTH = 12;
const MAX_GEOCODE_TEXT_VARIANTS = 5;
const DEFAULT_BIAS_LAT = 60.1699;
const DEFAULT_BIAS_LON = 24.9384;
const HSL_MUNICIPALITY_TOKENS = ["helsinki", "espoo", "vantaa", "kauniainen"];

function safeString(value, maxLength) {
  const text = String(value || "");
  return text.length <= maxLength ? text : text.slice(0, maxLength);
}

function parseCoordinate(raw) {
  if (raw == null) return null;
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    const value = Number(trimmed);
    return Number.isFinite(value) ? value : null;
  }
  return typeof raw === "number" && Number.isFinite(raw) ? raw : null;
}

function isValidLatLon(lat, lon) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  return lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
}

function normalizeLanguage(raw) {
  if (raw == null) return null;
  const value = safeString(raw, MAX_LANG_LENGTH).trim();
  if (!value) return null;
  return /^[a-z]{2,3}(?:-[A-Za-z]{2})?$/.test(value) ? value : null;
}

function addVariant(variants, value) {
  const normalized = safeString(value, MAX_QUERY_LENGTH).trim();
  if (!normalized) return;
  if (variants.some((item) => item.toLowerCase() === normalized.toLowerCase())) return;
  variants.push(normalized);
}

function normalizeGeocodeQuery(value) {
  return safeString(value, MAX_QUERY_LENGTH)
    .normalize("NFC")
    .replace(/[^\p{L}\p{N}\s\-']/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildGeocodeTextVariants(text) {
  const base = normalizeGeocodeQuery(text);
  if (!base) return [];

  const variants = [];
  addVariant(variants, base);
  const hyphenAsSpace = base.replace(/-/g, " ").replace(/\s+/g, " ").trim();
  addVariant(variants, hyphenAsSpace);

  const tokens = hyphenAsSpace.split(" ").filter(Boolean);
  for (let index = 0; index < tokens.length - 1 && variants.length < MAX_GEOCODE_TEXT_VARIANTS; index += 1) {
    const merged = [...tokens];
    merged.splice(index, 2, `${tokens[index]}${tokens[index + 1]}`);
    addVariant(variants, merged.join(" "));
  }

  addVariant(variants, tokens.join(""));
  addVariant(variants, base.replace(/-/g, ""));

  if (!tokens.some((token) => HSL_MUNICIPALITY_TOKENS.includes(token)) && tokens.length >= 2) {
    for (const municipality of HSL_MUNICIPALITY_TOKENS) {
      addVariant(variants, `${hyphenAsSpace}${municipality}`);
      if (variants.length >= MAX_GEOCODE_TEXT_VARIANTS) break;
      addVariant(variants, `${hyphenAsSpace} ${municipality}`);
    }
  }

  return variants.slice(0, MAX_GEOCODE_TEXT_VARIANTS);
}

function parseGeocodeRequest(query) {
  const text = safeString(query.text, MAX_QUERY_LENGTH).trim();
  if (text.length < MIN_QUERY_LENGTH) {
    return { error: "Invalid text", params: null };
  }

  const rawLat = parseCoordinate(query.lat);
  const rawLon = parseCoordinate(query.lon);
  const hasBiasInput = query.lat != null || query.lon != null;
  if (hasBiasInput && (rawLat == null || rawLon == null || !isValidLatLon(rawLat, rawLon))) {
    return { error: "Invalid lat/lon", params: null };
  }

  return {
    error: null,
    params: {
      text,
      biasLat: hasBiasInput ? rawLat : DEFAULT_BIAS_LAT,
      biasLon: hasBiasInput ? rawLon : DEFAULT_BIAS_LON,
      lang: normalizeLanguage(query.lang),
      textVariants: buildGeocodeTextVariants(text),
    },
  };
}

function buildNoMatchPayload(text) {
  return {
    query: text,
    location: null,
    choices: [],
    ambiguous: false,
    message: "No matching location found in HSL area.",
  };
}

module.exports = {
  MIN_QUERY_LENGTH,
  MAX_QUERY_LENGTH,
  MAX_LANG_LENGTH,
  parseCoordinate,
  isValidLatLon,
  normalizeLanguage,
  normalizeGeocodeQuery,
  buildGeocodeTextVariants,
  parseGeocodeRequest,
  buildNoMatchPayload,
  safeString,
};
