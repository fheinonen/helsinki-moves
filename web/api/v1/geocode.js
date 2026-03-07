const { graphqlRequest } = require("../lib/digitransit");
const {
  parseCoordinate,
  isValidLatLon,
  normalizeLanguage,
  normalizeGeocodeQuery,
  buildGeocodeTextVariants,
  parseGeocodeRequest,
  buildNoMatchPayload,
} = require("../lib/geocode-query");
const {
  getGeocodingUrl,
  parseFeature,
  geocode,
  hasNearbyHslStop,
  filterHslValidCandidates,
} = require("../lib/geocode-client");
const {
  normalizeForMatch,
  tokenMatches,
  countStrongTokenMatches,
  scoreCandidate,
  rankCandidatesForQuery,
  buildAmbiguousChoices,
  buildLocationPayload,
} = require("../lib/geocode-ranking");

async function collectGeocodeCandidates({
  textVariants,
  biasLat,
  biasLon,
  lang,
  fetchImpl,
  getApiKey,
}) {
  const allCandidates = [];

  for (let variantIndex = 0; variantIndex < textVariants.length; variantIndex += 1) {
    const variant = textVariants[variantIndex];
    const candidates = await geocode(variant, biasLat, biasLon, lang, {
      fetchImpl,
      getApiKey,
    });
    for (const candidate of candidates) {
      allCandidates.push({
        ...candidate,
        variantIndex,
        queryVariant: variant,
      });
    }
  }

  return allCandidates;
}

async function resolveGeocodeMatch({
  text,
  textVariants,
  biasLat,
  biasLon,
  lang,
  fetchImpl,
  graphqlRequestImpl,
  getApiKey,
}) {
  const allCandidates = await collectGeocodeCandidates({
    textVariants,
    biasLat,
    biasLon,
    lang,
    fetchImpl,
    getApiKey,
  });

  const validCandidates = await filterHslValidCandidates(allCandidates, {
    hasNearbyStop: (lat, lon) =>
      hasNearbyHslStop(lat, lon, {
        graphqlRequestImpl,
      }),
  });

  const rankedCandidates = rankCandidatesForQuery(validCandidates, text);
  const bestMatch = rankedCandidates[0] || null;
  const location = bestMatch ? buildLocationPayload(bestMatch.candidate) : null;
  const choices = buildAmbiguousChoices(rankedCandidates);

  return {
    location,
    choices,
    ambiguous: choices.length > 1,
  };
}

function createGeocodeHandler({
  fetchImpl = fetch,
  graphqlRequestImpl = graphqlRequest,
  getApiKey = () => process.env.DIGITRANSIT_API_KEY,
  logError = console.error,
} = {}) {
  return async function handler(req, res) {
    res.setHeader("Cache-Control", "no-store");

    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return res.status(405).json({ error: "Method not allowed" });
    }

    const parsedRequest = parseGeocodeRequest(req.query);
    if (parsedRequest.error) {
      return res.status(400).json({ error: parsedRequest.error });
    }

    const { text, biasLat, biasLon, lang, textVariants } = parsedRequest.params;

    try {
      const match = await resolveGeocodeMatch({
        text,
        textVariants,
        biasLat,
        biasLon,
        lang,
        fetchImpl,
        graphqlRequestImpl,
        getApiKey,
      });

      if (!match.location) {
        return res.status(200).json(buildNoMatchPayload(text));
      }

      return res.status(200).json({
        query: text,
        location: match.location,
        choices: match.choices,
        ambiguous: match.ambiguous,
      });
    } catch (error) {
      logError("v1/geocode API error:", error);
      return res.status(500).json({ error: "Could not approximate location. Please try again." });
    }
  };
}

const handler = createGeocodeHandler();

module.exports = handler;
module.exports._private = {
  parseCoordinate,
  isValidLatLon,
  normalizeLanguage,
  normalizeGeocodeQuery,
  getGeocodingUrl,
  parseFeature,
  geocode,
  hasNearbyHslStop,
  filterHslValidCandidates,
  parseGeocodeRequest,
  collectGeocodeCandidates,
  resolveGeocodeMatch,
  buildNoMatchPayload,
  createGeocodeHandler,
  buildGeocodeTextVariants,
  normalizeForMatch,
  tokenMatches,
  countStrongTokenMatches,
  scoreCandidate,
  rankCandidatesForQuery,
  buildAmbiguousChoices,
};
