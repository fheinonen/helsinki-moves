const DEFAULT_HSL_MUNICIPALITIES = ["helsinki", "espoo", "vantaa", "kauniainen"];
const MAX_GEOCODE_TEXT_VARIANTS = 5;
const MAX_QUERY_LENGTH = 140;

function safeString(value: unknown, maxLength: number): string {
  const text = String(value || "");
  return text.length <= maxLength ? text : text.slice(0, maxLength);
}

function addVariant(variants: string[], value: string): void {
  const normalized = safeString(value, MAX_QUERY_LENGTH).trim();
  if (!normalized) {
    return;
  }
  if (variants.some((variant) => variant.toLowerCase() === normalized.toLowerCase())) {
    return;
  }
  variants.push(normalized);
}

export function normalizeGeocodeQuery(value: string): string {
  return safeString(value, MAX_QUERY_LENGTH)
    .normalize("NFC")
    .replace(/[^\p{L}\p{N}\s\-']/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildGeocodeTextVariants(text: string): string[] {
  const base = normalizeGeocodeQuery(text);
  if (!base) {
    return [];
  }

  const variants: string[] = [];
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

  if (!tokens.some((token) => DEFAULT_HSL_MUNICIPALITIES.includes(token)) && tokens.length >= 2) {
    for (const municipality of DEFAULT_HSL_MUNICIPALITIES) {
      addVariant(variants, `${hyphenAsSpace}${municipality}`);
      if (variants.length >= MAX_GEOCODE_TEXT_VARIANTS) {
        break;
      }
      addVariant(variants, `${hyphenAsSpace} ${municipality}`);
    }
  }

  return variants.slice(0, MAX_GEOCODE_TEXT_VARIANTS);
}

export function buildNoMatchPayload(query: string) {
  return {
    ambiguous: false,
    choices: [],
    location: null,
    message: "No matching location found in HSL area.",
    query,
  };
}
