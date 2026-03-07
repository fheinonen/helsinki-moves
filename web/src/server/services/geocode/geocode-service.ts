import type { DigitransitService } from "../digitransit/types.js";
import type {
  GeocodeRequest,
  GeocodeSuccessResponse,
} from "../../../shared/contracts/geocode-contract.js";
import { buildGeocodeTextVariants, buildNoMatchPayload } from "./query.js";
import { filterHslValidCandidates, geocode, type RawGeocodeCandidate } from "./client.js";
import {
  buildAmbiguousChoices,
  buildLocationPayload,
  rankCandidatesForQuery,
} from "./ranking.js";

export interface GeocodeService {
  resolve(input: GeocodeRequest): Promise<GeocodeSuccessResponse>;
}

interface CreateGeocodeServiceOptions {
  digitransitService: DigitransitService;
  fetchImpl?: typeof fetch;
  getApiKey?: () => string | undefined;
}

async function collectGeocodeCandidates(input: {
  biasLat: number;
  biasLon: number;
  fetchImpl?: typeof fetch;
  getApiKey?: () => string | undefined;
  lang: string | null;
  textVariants: string[];
}): Promise<RawGeocodeCandidate[]> {
  const allCandidates: RawGeocodeCandidate[] = [];

  for (let variantIndex = 0; variantIndex < input.textVariants.length; variantIndex += 1) {
    const queryVariant = input.textVariants[variantIndex];
    const candidates = await geocode({
      biasLat: input.biasLat,
      biasLon: input.biasLon,
      fetchImpl: input.fetchImpl,
      getApiKey: input.getApiKey,
      lang: input.lang,
      query: queryVariant,
    });
    for (const candidate of candidates) {
      allCandidates.push({
        ...candidate,
        queryVariant,
        variantIndex,
      });
    }
  }

  return allCandidates;
}

export function createGeocodeService(
  options: CreateGeocodeServiceOptions
): GeocodeService {
  return {
    async resolve(input) {
      const textVariants = buildGeocodeTextVariants(input.query);
      const allCandidates = await collectGeocodeCandidates({
        biasLat: input.biasLat,
        biasLon: input.biasLon,
        fetchImpl: options.fetchImpl,
        getApiKey: options.getApiKey,
        lang: input.lang,
        textVariants,
      });
      const validCandidates = await filterHslValidCandidates(
        allCandidates,
        options.digitransitService
      );
      const rankedCandidates = rankCandidatesForQuery(validCandidates, input.query);
      const bestMatch = rankedCandidates[0] || null;
      if (!bestMatch) {
        return buildNoMatchPayload(input.query);
      }

      const choices = buildAmbiguousChoices(rankedCandidates);
      return {
        ambiguous: choices.length > 1,
        choices,
        location: buildLocationPayload(bestMatch.candidate),
        query: input.query,
      };
    },
  };
}
