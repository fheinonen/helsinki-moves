import type { AromaIndex, IndexedMethod, MethodLocation, MethodRef, Query } from "./corpus.ts";
import { prune, type Pruned } from "./prune.ts";

export type SearchOptions = {
  /** How many methods the light-weight search keeps for reranking (the paper's η1). */
  searchLimit?: number;
  /** The most results to return. */
  limit?: number;
  /** Results must be more similar to the query than this, from 0 to 1. */
  minSimilarity?: number;
  /** Methods to leave out, such as ones the pull request under review added. A copy elsewhere of a method left out still counts. */
  exclude?: (method: MethodRef) => boolean;
};

export const DEFAULT_SEARCH_LIMIT = 1000;
const DEFAULT_RESULT_LIMIT = 100;

/** A method that contains code like the query. */
export type SearchResult = {
  method: MethodRef;
  /**
   * The share of the query's features found in the part of the method that
   * resembles it, from 0 to 1. The paper treats 0.71 and up as close enough to
   * reuse the existing code with small changes (Section 2).
   */
  similarity: number;
  /** The lines of the method's file that resemble the query. */
  matchedLines: number[];
};

/**
 * A method of the reranked list, at the first of its locations the search may
 * use, with the tokens pruning kept.
 */
export type Ranked = { id: number; method: IndexedMethod; pruned: Pruned };

/**
 * Phases I and II of the paper. The light-weight search scores every method by
 * how many of the query's distinct features it has and keeps the top
 * `searchLimit`. Each of those is then pruned against the query, and the list
 * is reordered by how similar the pruned snippet is to the query, which says
 * how well a method contains the query instead of how much it shares with it.
 */
export function rank(
  index: AromaIndex,
  query: Query,
  options: Pick<SearchOptions, "searchLimit" | "exclude"> = {},
): Ranked[] {
  const overlap = new Int32Array(index.methods.length);
  for (const feature of query.features.keys()) {
    const end = index.postingOffsets[feature + 1]!;
    for (let at = index.postingOffsets[feature]!; at < end; at += 1) {
      overlap[index.postings[at]!]! += 1;
    }
  }
  const origin = query.origin;
  const usable = (location: MethodLocation) => {
    const isOrigin =
      origin !== undefined &&
      location.path === origin.path &&
      location.startLine <= origin.endLine &&
      location.endLine >= origin.startLine;
    return !isOrigin && !options.exclude?.(reference(location));
  };
  const candidates: number[] = [];
  const locations = new Map<number, MethodLocation>();
  index.methods.forEach((method, id) => {
    if (overlap[id] === 0 || method.language !== query.language) {
      return;
    }
    // The query's own method, or one the caller excludes, may have a copy elsewhere.
    const location = usable(method) ? method : method.copies.find(usable);
    if (location) {
      candidates.push(id);
      locations.set(id, location);
    }
  });
  candidates.sort((a, b) => overlap[b]! - overlap[a]! || a - b);

  // The sort is stable, so equally similar methods keep their first-phase order.
  return candidates
    .slice(0, options.searchLimit ?? DEFAULT_SEARCH_LIMIT)
    .map((id) => {
      const indexed = index.methods[id]!;
      const location = locations.get(id)!;
      const method = location === indexed ? indexed : { ...indexed, ...location };
      return { id, method, pruned: prune(query.features, method) };
    })
    .sort((a, b) => b.pruned.score - a.pruned.score);
}

/**
 * Methods of the corpus that contain code like the query, most similar first.
 * This is Aroma's structural code-to-code search on its own, without the
 * clustering that turns results into recommendations.
 */
export function search(
  index: AromaIndex,
  query: Query,
  options: SearchOptions = {},
): SearchResult[] {
  const minSimilarity = options.minSimilarity ?? 0;
  const results: SearchResult[] = [];
  for (const { method, pruned } of rank(index, query, options)) {
    const similarity = pruned.score / query.size;
    if (similarity > minSimilarity && results.length < (options.limit ?? DEFAULT_RESULT_LIMIT)) {
      results.push({
        method: reference(method),
        similarity,
        matchedLines: linesOf(method, pruned.tokens),
      });
    }
  }
  return results;
}

/** Every line the given tokens of a method are on, ascending. */
function linesOf(method: IndexedMethod, tokens: readonly number[]): number[] {
  const lines = new Set<number>();
  for (const token of tokens) {
    for (let line = method.tokenLines[token]!; line <= method.tokenEndLines[token]!; line += 1) {
      lines.add(line);
    }
  }
  return [...lines].sort((a, b) => a - b);
}

export function reference(method: MethodRef): MethodRef {
  return {
    path: method.path,
    name: method.name,
    language: method.language,
    startLine: method.startLine,
    endLine: method.endLine,
  };
}
