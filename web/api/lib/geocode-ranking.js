const { safeString, MAX_QUERY_LENGTH } = require("./geocode-query");

const MAX_MATCH_TEXT_LENGTH = 220;
const AMBIGUITY_SCORE_DELTA = 8;
const AMBIGUITY_MAX_CHOICES = 4;

function normalizeForMatch(value, maxLength) {
  const normalized = safeString(value, maxLength)
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  const tokens = normalized ? normalized.split(" ").filter(Boolean) : [];
  return {
    text: normalized,
    tokens,
    compact: tokens.join(""),
  };
}

function tokenMatches(queryToken, labelToken) {
  if (!queryToken || !labelToken) return false;
  if (labelToken === queryToken) return true;
  if (queryToken.length < 3) return false;
  if (labelToken.startsWith(queryToken) || queryToken.startsWith(labelToken)) return true;
  if (queryToken.length >= 5 && labelToken.includes(queryToken)) return true;
  if (labelToken.length >= 5 && queryToken.includes(labelToken)) return true;
  return false;
}

function computeTokenCoverage(queryTokens, labelTokens) {
  if (!queryTokens.length || !labelTokens.length) return 0;
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

function computeOrderedTokenCoverage(queryTokens, labelTokens) {
  if (!queryTokens.length || !labelTokens.length) return 0;
  let labelIndex = 0;
  let matched = 0;

  for (const queryToken of queryTokens) {
    if (!queryToken) continue;
    for (; labelIndex < labelTokens.length; labelIndex += 1) {
      if (!tokenMatches(queryToken, labelTokens[labelIndex])) continue;
      matched += 1;
      labelIndex += 1;
      break;
    }
  }

  return matched / queryTokens.length;
}

function isWeakLocationToken(token) {
  if (!token) return true;
  if (token.length < 4) return true;
  return token === "helsinki" || token === "espoo" || token === "vantaa" || token === "kauniainen";
}

function computeMissingTokenPenalty(queryTokens, labelTokens) {
  if (queryTokens.length < 2 || !labelTokens.length) return 0;
  let penalty = 0;
  let unmatchedStrongTokens = 0;

  for (const queryToken of queryTokens) {
    if (isWeakLocationToken(queryToken)) continue;
    if (labelTokens.some((labelToken) => tokenMatches(queryToken, labelToken))) continue;
    unmatchedStrongTokens += 1;
    penalty += Math.min(24, 8 + Math.max(0, queryToken.length - 4) * 2);
  }

  if (unmatchedStrongTokens >= 1) penalty += 8;
  return penalty;
}

function countStrongTokenMatches(queryTokens, labelTokens) {
  if (!queryTokens.length || !labelTokens.length) return 0;
  let count = 0;
  for (const queryToken of queryTokens) {
    if (isWeakLocationToken(queryToken)) continue;
    if (labelTokens.some((labelToken) => tokenMatches(queryToken, labelToken))) {
      count += 1;
    }
  }
  return count;
}

function scoreCandidate(queryMatch, candidate) {
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
    score += Math.max(0, Math.min(1, candidate.confidence)) * 10;
  }

  return score;
}

function buildLocationPayload(candidate) {
  return {
    lat: candidate.lat,
    lon: candidate.lon,
    label: candidate.label,
    confidence: candidate.confidence,
  };
}

function rankCandidatesForQuery(candidates, queryText) {
  const originalQueryMatch = normalizeForMatch(queryText, MAX_QUERY_LENGTH);
  return (Array.isArray(candidates) ? candidates : [])
    .map((candidate) => {
      const labelMatch = normalizeForMatch(candidate.label || "", MAX_MATCH_TEXT_LENGTH);
      const strongTokenMatches = countStrongTokenMatches(originalQueryMatch.tokens, labelMatch.tokens);
      let score = scoreCandidate(originalQueryMatch, candidate);

      const variantQuery = String(candidate.queryVariant || "").trim();
      if (variantQuery) {
        const variantQueryMatch = normalizeForMatch(variantQuery, MAX_QUERY_LENGTH);
        if (variantQueryMatch.text && variantQueryMatch.text !== originalQueryMatch.text) {
          score = Math.max(score, scoreCandidate(variantQueryMatch, candidate) + 4);
        }
      }

      return { candidate, score, strongTokenMatches };
    })
    .sort((a, b) => {
      if (b.strongTokenMatches !== a.strongTokenMatches) {
        return b.strongTokenMatches - a.strongTokenMatches;
      }
      if (b.score !== a.score) {
        return b.score - a.score;
      }

      const confidenceA = Number.isFinite(a.candidate?.confidence) ? a.candidate.confidence : -1;
      const confidenceB = Number.isFinite(b.candidate?.confidence) ? b.candidate.confidence : -1;
      if (confidenceB !== confidenceA) {
        return confidenceB - confidenceA;
      }

      return (a.candidate?.variantIndex || 0) - (b.candidate?.variantIndex || 0);
    });
}

function buildAmbiguousChoices(rankedCandidates) {
  if (!Array.isArray(rankedCandidates) || rankedCandidates.length < 2) return [];
  const best = rankedCandidates[0];
  if (!best || best.strongTokenMatches <= 0) return [];

  const choices = [];
  const seen = new Set();

  for (const ranked of rankedCandidates) {
    if (ranked.strongTokenMatches !== best.strongTokenMatches) continue;
    if (ranked.score < best.score - AMBIGUITY_SCORE_DELTA) continue;

    const location = buildLocationPayload(ranked.candidate);
    const dedupeKey = `${location.lat.toFixed(6)},${location.lon.toFixed(6)}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    choices.push(location);
    if (choices.length >= AMBIGUITY_MAX_CHOICES) break;
  }

  return choices.length >= 2 ? choices : [];
}

module.exports = {
  MAX_MATCH_TEXT_LENGTH,
  normalizeForMatch,
  tokenMatches,
  countStrongTokenMatches,
  scoreCandidate,
  rankCandidatesForQuery,
  buildAmbiguousChoices,
  buildLocationPayload,
};
