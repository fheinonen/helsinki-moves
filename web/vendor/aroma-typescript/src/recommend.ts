import type { AromaIndex, IndexedMethod, MethodRef, Query } from "./corpus.ts";
import type { ParsedMethod } from "./language.ts";
import { prune, type Multiset, type TokenTable } from "./prune.ts";
import { rank, reference, type Ranked, type SearchOptions } from "./search.ts";
import type { Node } from "./tree.ts";

export type RecommendOptions = Pick<SearchOptions, "searchLimit" | "exclude"> & {
  /** How many of the most similar methods are clustered (the paper's η2). */
  clusterLimit?: number;
  /** Only methods more similar to the query than this are clustered (τ1). */
  minSimilarity?: number;
  /**
   * A cluster's shared code must have more than this many times the features
   * of the part that resembles the query (τ2), so that it adds to the query.
   */
  minExpansion?: number;
  /**
   * The query-like parts of a cluster's methods must share more than this
   * share of the first method's query-like part (τ3), so that the methods
   * contain the same part of the query.
   */
  minCohesion?: number;
  /** A cluster is dropped when it shares more than this share of its methods with an earlier one. */
  maxClusterOverlap?: number;
  /** The most recommendations to return (K). */
  limit?: number;
  /**
   * The fewest methods a recommendation must come from: 2 when omitted, so
   * that only code that recurs is recommended. Pass 1 for the paper's
   * behavior, which also returns each unclustered method whole.
   */
  minSupport?: number;
};

const DEFAULTS = {
  clusterLimit: 100,
  minSimilarity: 0.65,
  minExpansion: 1.5,
  minCohesion: 0.9,
  maxClusterOverlap: 0.5,
  limit: 5,
  minSupport: 2,
};

export type RecommendedLine = {
  /** 1-based line of `Recommendation.method.path`. */
  line: number;
  text: string;
  /**
   * `query`: every name and literal kept on the line resembles the query.
   * `added`: the line has code the cluster's methods share beyond the query.
   * `structure`: it holds only keywords and punctuation around such lines.
   */
  role: "query" | "added" | "structure";
};

/** Code that several methods of the corpus have around code like the query. */
export type Recommendation = {
  /** The method the lines are taken from: the cluster's most similar one. */
  method: MethodRef;
  /** Every method of the cluster, `method` first. */
  members: MethodRef[];
  /** How similar `method` is to the query, from 0 to 1. */
  similarity: number;
  /** The lines of `method` that the cluster's methods share. */
  lines: RecommendedLine[];
  /** The text of `lines`, without their common indentation. */
  code: string;
};

/**
 * Aroma's recommendations for a query (Section 3.3): search for the methods
 * that contain code like it, cluster those that are alike, and intersect each
 * cluster down to the code its methods share. Each recommendation contains
 * the query, approximately, and code that goes with it in the corpus.
 */
export function recommend(
  index: AromaIndex,
  query: Query,
  options: RecommendOptions = {},
): Recommendation[] {
  const settings = { ...DEFAULTS, ...options };
  const candidates = rank(index, query, options)
    .filter(({ pruned }) => pruned.score / query.size > settings.minSimilarity)
    .slice(0, settings.clusterLimit);
  const parsed = new Map<string, ParsedMethod[]>();
  return cluster(candidates, settings)
    .filter((members) => members.length >= settings.minSupport)
    .slice(0, settings.limit)
    .map((members) => {
      const first = candidates[members[0]!]!;
      const kept = intersect(
        members.map((member) => candidates[member]!.method),
        query,
      );
      const lines = render(
        index,
        first.method,
        new Set(kept),
        new Set(first.pruned.tokens),
        parsed,
      );
      return {
        method: reference(first.method),
        members: members.map((member) => reference(candidates[member]!.method)),
        similarity: first.pruned.score / query.size,
        lines,
        code: dedent(lines.map((line) => line.text)).join("\n"),
      };
    });
}

/**
 * Clusters of the reranked methods, as lists of positions in `candidates`.
 *
 * A cluster is valid when the features all its methods share (cs) outnumber
 * the features their query-like parts share (csq) by `minExpansion`, and csq
 * is at least `minCohesion` of the first method's query-like part. Each valid
 * single method grows by the later method that keeps the cluster valid with
 * the highest cs / csq, until none does. Clusters are then ordered by their
 * first method, and one that mostly repeats an earlier cluster is dropped.
 */
function cluster(candidates: Ranked[], settings: typeof DEFAULTS): number[][] {
  const whole = candidates.map(({ method }) => featuresOf(method));
  const queryLike = candidates.map(({ method, pruned }) => featuresOf(method, pruned.tokens));
  const clusters: number[][] = [];
  candidates.forEach((_, seed) => {
    const seedSize = size(queryLike[seed]!);
    if (seedSize === 0 || size(whole[seed]!) / seedSize <= settings.minExpansion) {
      return;
    }
    const members = [seed];
    let shared = whole[seed]!;
    let sharedQueryLike = queryLike[seed]!;
    for (;;) {
      let best: { member: number; expansion: number } | undefined;
      for (let member = members.at(-1)! + 1; member < candidates.length; member += 1) {
        const csq = intersectionSize(sharedQueryLike, queryLike[member]!);
        if (csq === 0 || csq / seedSize <= settings.minCohesion) {
          continue;
        }
        const expansion = intersectionSize(shared, whole[member]!) / csq;
        if (expansion > settings.minExpansion && expansion > (best?.expansion ?? 0)) {
          best = { member, expansion };
        }
      }
      if (!best) {
        break;
      }
      members.push(best.member);
      shared = intersection(shared, whole[best.member]!);
      sharedQueryLike = intersection(sharedQueryLike, queryLike[best.member]!);
    }
    clusters.push(members);
  });
  return clusters.filter((members, position) =>
    clusters
      .slice(0, position)
      .every((earlier) => jaccard(earlier, members) <= settings.maxClusterOverlap),
  );
}

/**
 * The tokens of a cluster's first method that its other methods have too
 * (Intersect in the paper): the first method pruned against each other method
 * in turn. The query's features are added to each target so that code like
 * the query is never pruned away. A cluster of one is the whole method
 * (Section 4.3.5).
 */
function intersect(members: IndexedMethod[], query: Query): number[] {
  const first = members[0]!;
  let kept: number[] | undefined;
  for (const other of members.slice(1)) {
    const target = new Map(featuresOf(other));
    for (const [feature, count] of query.features) {
      target.set(feature, (target.get(feature) ?? 0) + count);
    }
    kept = prune(target, first, kept).tokens;
  }
  return kept ?? Array.from({ length: first.offsets.length - 1 }, (_, token) => token);
}

/** The features of a method's tokens, or of the given ones, as a multiset. */
function featuresOf(table: TokenTable, tokens?: number[]): Map<number, number> {
  const counts = new Map<number, number>();
  const add = (start: number, end: number) => {
    for (let at = start; at < end; at += 1) {
      const feature = table.features[at]!;
      counts.set(feature, (counts.get(feature) ?? 0) + 1);
    }
  };
  if (tokens) {
    for (const token of tokens) {
      add(table.offsets[token]!, table.offsets[token + 1]!);
    }
  } else {
    add(0, table.features.length);
  }
  return counts;
}

function size(features: Multiset): number {
  let total = 0;
  for (const count of features.values()) {
    total += count;
  }
  return total;
}

function intersection(a: Multiset, b: Multiset): Map<number, number> {
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  const shared = new Map<number, number>();
  for (const [feature, count] of small) {
    const other = large.get(feature);
    if (other !== undefined) {
      shared.set(feature, Math.min(count, other));
    }
  }
  return shared;
}

function intersectionSize(a: Multiset, b: Multiset): number {
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  let total = 0;
  for (const [feature, count] of small) {
    total += Math.min(count, large.get(feature) ?? 0);
  }
  return total;
}

function jaccard(a: number[], b: number[]): number {
  const shared = a.filter((member) => b.includes(member)).length;
  return shared / (a.length + b.length - shared);
}

/**
 * The lines of a method that a pruned snippet covers: the lines of its kept
 * tokens, and of the keywords and punctuation of every tree on the way from a
 * kept token to the root, which is what the paper's pruned tree retains.
 */
function render(
  index: AromaIndex,
  method: IndexedMethod,
  kept: ReadonlySet<number>,
  queryLike: ReadonlySet<number>,
  parsed: Map<string, ParsedMethod[]>,
): RecommendedLine[] {
  const source = index.sources.get(method.path)!;
  let methods = parsed.get(method.path);
  if (!methods) {
    const language = index.languages.find((candidate) => candidate.id === method.language)!;
    methods = language.parseMethods(source, method.path);
    parsed.set(method.path, methods);
  }
  const body = methods[method.ordinal]!.body;

  // Per line: whether it has a kept token, and whether all of them are query-like.
  const roles = new Map<number, RecommendedLine["role"]>();
  let position = 0;
  const visit = (node: Node): boolean => {
    if (node.kind === "token") {
      if (node.keyword) {
        return false;
      }
      const token = position;
      position += 1;
      if (!kept.has(token)) {
        return false;
      }
      for (let line = node.line; line <= node.endLine; line += 1) {
        const role = roles.get(line);
        if (role !== "added") {
          roles.set(line, queryLike.has(token) ? "query" : "added");
        }
      }
      return true;
    }
    let any = false;
    for (const child of node.children) {
      any = visit(child) || any;
    }
    if (any) {
      for (const child of node.children) {
        if (child.kind === "token" && child.keyword && !roles.has(child.line)) {
          roles.set(child.line, "structure");
        }
      }
    }
    return any;
  };
  visit(body);

  const text = source.split("\n");
  return [...roles]
    .sort(([a], [b]) => a - b)
    .map(([line, role]) => ({ line, text: (text[line - 1] ?? "").trimEnd(), role }));
}

function dedent(lines: string[]): string[] {
  const indents = lines
    .filter((line) => line.trim() !== "")
    .map((line) => line.length - line.trimStart().length);
  const common = indents.length === 0 ? 0 : Math.min(...indents);
  return lines.map((line) => line.slice(common));
}
