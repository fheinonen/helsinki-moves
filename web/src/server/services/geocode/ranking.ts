import type { GeocodeLocation } from "../../../shared/contracts/geocode-contract.js";

const AMBIGUITY_MAX_CHOICES = 4;
const AMBIGUITY_SCORE_DELTA = 8;
const MAX_MATCH_TEXT_LENGTH = 220;
const MAX_QUERY_LENGTH = 140;

interface RankedGeocodeCandidate {
  candidate: ResolvedGeocodeCandidate;
  score: number;
  strongTokenMatches: number;
}

export interface ResolvedGeocodeCandidate extends GeocodeLocation {
  queryVariant?: string;
  variantIndex?: number;
}

function safeString(value: unknown, maxLength: number): string {
  const text = String(value || "");
  return text.length <= maxLength ? text : text.slice(0, maxLength);
}

function normalizeForMatch(value: unknown, maxLength: number) {
  const normalized = safeString(value, maxLength)
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  const tokens = normalized ? normalized.split(" ").filter(Boolean) : [];
  return {
    compact: tokens.join(""),
    text: normalized,
    tokens,
  };
}

function tokenMatches(queryToken: string, labelToken: string): boolean {
  if (!queryToken || !labelToken) {
    return false;
  }
  if (labelToken === queryToken) {
    return true;
  }
  if (queryToken.length < 3) {
    return false;
  }
  if (labelToken.startsWith(queryToken) || queryToken.startsWith(labelToken)) {
    return true;
  }
  if (queryToken.length >= 5 && labelToken.includes(queryToken)) {
    return true;
  }
  if (labelToken.length >= 5 && queryToken.includes(labelToken)) {
    return true;
  }
  return false;
}

function computeTokenCoverage(queryTokens: string[], labelTokens: string[]): number {
  if (queryTokens.length === 0 || labelTokens.length === 0) {
    return 0;
  }

  const labelSet = new Set(labelTokens);
  let matched = 0;
  for (const queryToken of queryTokens) {
    if (labelSet.has(queryToken)) {
      matched += 1;
      continue;
    }
    if (labelTokens.some((labelToken) => tokenMatches(queryToken, labelToken))) {
      matched += 0.5;
    }
  }
  return matched / queryTokens.length;
}

function computeOrderedTokenCoverage(queryTokens: string[], labelTokens: string[]): number {
  if (queryTokens.length === 0 || labelTokens.length === 0) {
    return 0;
  }

  let labelIndex = 0;
  let matched = 0;
  for (const queryToken of queryTokens) {
    if (!queryToken) {
      continue;
    }
    for (; labelIndex < labelTokens.length; labelIndex += 1) {
      if (!tokenMatches(queryToken, labelTokens[labelIndex])) {
        continue;
      }
      matched += 1;
      labelIndex += 1;
      break;
    }
  }

  return matched / queryTokens.length;
}

function isWeakLocationToken(token: string): boolean {
  return (
    !token ||
    token.length < 4 ||
    token === "helsinki" ||
    token === "espoo" ||
    token === "vantaa" ||
    token === "kauniainen"
  );
}

function computeMissingTokenPenalty(queryTokens: string[], labelTokens: string[]): number {
  if (queryTokens.length < 2 || labelTokens.length === 0) {
    return 0;
  }

  let penalty = 0;
  let unmatchedStrongTokens = 0;
  for (const queryToken of queryTokens) {
    if (isWeakLocationToken(queryToken)) {
      continue;
    }
    if (labelTokens.some((labelToken) => tokenMatches(queryToken, labelToken))) {
      continue;
    }
    unmatchedStrongTokens += 1;
    penalty += Math.min(24, 8 + Math.max(0, queryToken.length - 4) * 2);
  }
  if (unmatchedStrongTokens >= 1) {
    penalty += 8;
  }
  return penalty;
}

function countStrongTokenMatches(queryTokens: string[], labelTokens: string[]): number {
  if (queryTokens.length === 0 || labelTokens.length === 0) {
    return 0;
  }

  let count = 0;
  for (const queryToken of queryTokens) {
    if (isWeakLocationToken(queryToken)) {
      continue;
    }
    if (labelTokens.some((labelToken) => tokenMatches(queryToken, labelToken))) {
      count += 1;
    }
  }
  return count;
}

function scoreCandidate(
  queryMatch: ReturnType<typeof normalizeForMatch>,
  candidate: ResolvedGeocodeCandidate
): number {
  const labelMatch = normalizeForMatch(candidate.label || "", MAX_MATCH_TEXT_LENGTH);
  let score = 0;

  if (queryMatch.compact && labelMatch.compact) {
    if (queryMatch.compact === labelMatch.compact) {
      score += 100;
    } else if (labelMatch.compact.includes(queryMatch.compact)) {
      score += 65;
    } else if (queryMatch.compact.includes(labelMatch.compact)) {
      score += 25;
    }
  }

  score += computeTokenCoverage(queryMatch.tokens, labelMatch.tokens) * 60;
  score += computeOrderedTokenCoverage(queryMatch.tokens, labelMatch.tokens) * 20;
  score -= computeMissingTokenPenalty(queryMatch.tokens, labelMatch.tokens);
  score += Math.max(0, 10 - (candidate.variantIndex || 0) * 2);

  if (Number.isFinite(candidate.confidence)) {
    score += Math.max(0, Math.min(1, candidate.confidence || 0)) * 10;
  }

  return score;
}

export function rankCandidatesForQuery(
  candidates: ResolvedGeocodeCandidate[],
  queryText: string
): RankedGeocodeCandidate[] {
  const originalQueryMatch = normalizeForMatch(queryText, MAX_QUERY_LENGTH);
  return candidates
    .map((candidate) => {
      const labelMatch = normalizeForMatch(candidate.label || "", MAX_MATCH_TEXT_LENGTH);
      const strongMatches = countStrongTokenMatches(originalQueryMatch.tokens, labelMatch.tokens);
      let score = scoreCandidate(originalQueryMatch, candidate);

      const variantQuery = String(candidate.queryVariant || "").trim();
      if (variantQuery) {
        const variantQueryMatch = normalizeForMatch(variantQuery, MAX_QUERY_LENGTH);
        if (variantQueryMatch.text && variantQueryMatch.text !== originalQueryMatch.text) {
          score = Math.max(score, scoreCandidate(variantQueryMatch, candidate) + 4);
        }
      }

      return { candidate, score, strongTokenMatches: strongMatches };
    })
    .sort((left, right) => {
      if (right.strongTokenMatches !== left.strongTokenMatches) {
        return right.strongTokenMatches - left.strongTokenMatches;
      }
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      const leftConfidence = Number.isFinite(left.candidate.confidence) ? (left.candidate.confidence as number) : -1;
      const rightConfidence = Number.isFinite(right.candidate.confidence) ? (right.candidate.confidence as number) : -1;
      if (rightConfidence !== leftConfidence) {
        return rightConfidence - leftConfidence;
      }

      return (left.candidate.variantIndex || 0) - (right.candidate.variantIndex || 0);
    });
}

export function buildAmbiguousChoices(
  rankedCandidates: RankedGeocodeCandidate[]
): GeocodeLocation[] {
  if (rankedCandidates.length < 2) {
    return [];
  }

  const best = rankedCandidates[0];
  if (!best || best.strongTokenMatches <= 0) {
    return [];
  }

  const choices: GeocodeLocation[] = [];
  const seen = new Set<string>();
  for (const ranked of rankedCandidates) {
    if (ranked.strongTokenMatches !== best.strongTokenMatches) {
      continue;
    }
    if (ranked.score < best.score - AMBIGUITY_SCORE_DELTA) {
      continue;
    }

    const location = buildLocationPayload(ranked.candidate);
    const dedupeKey = `${location.latitude.toFixed(6)},${location.longitude.toFixed(6)}`;
    if (seen.has(dedupeKey)) {
      continue;
    }
    seen.add(dedupeKey);
    choices.push(location);
    if (choices.length >= AMBIGUITY_MAX_CHOICES) {
      break;
    }
  }

  return choices.length >= 2 ? choices : [];
}

export function buildLocationPayload(candidate: ResolvedGeocodeCandidate): GeocodeLocation {
  return {
    confidence: candidate.confidence,
    label: candidate.label,
    latitude: candidate.latitude,
    longitude: candidate.longitude,
  };
}
