import { createHash } from "node:crypto";

import { featurize, type TokenFeatures } from "./features.ts";
import { languageForPath, type Language, type SnippetOptions } from "./language.ts";
import { LANGUAGES } from "./languages/index.ts";
import type { Multiset, TokenTable } from "./prune.ts";
import type { Node } from "./tree.ts";

export type SourceFile = { path: string; source: string };

/** Where a method is, for reports. */
export type MethodRef = {
  path: string;
  name: string;
  language: string;
  startLine: number;
  endLine: number;
};

/** One place a method is written, with what showing it there needs. */
export type MethodLocation = MethodRef & {
  /** The lines each non-keyword token starts and ends on. */
  tokenLines: Uint32Array;
  tokenEndLines: Uint32Array;
  /** The method's position among the methods its language parses from the file. */
  ordinal: number;
};

/** A method of the corpus with the features of each of its non-keyword tokens. */
export type IndexedMethod = MethodLocation &
  TokenTable & {
    /**
     * Where later methods with the same tokens, local variables, and nesting
     * are. A search that leaves this method out answers with one of them.
     */
    copies: MethodLocation[];
  };

export type IndexStats = {
  /** Files of a known language that were parsed. */
  files: number;
  /** Methods indexed. */
  methods: number;
  /** Methods kept only as copies of an earlier method with the same tokens, locals, and nesting. */
  duplicateMethods: number;
  /** Distinct features across all methods. */
  features: number;
  /** Files skipped because no language claims their extension. */
  unsupportedFiles: number;
  /** Files skipped because they are longer than `maxFileLength`. */
  oversizedFiles: number;
};

/**
 * A code corpus featurized for search. Build one with `buildIndex`; treat the
 * fields other than `methods` and `stats` as internal.
 */
export type AromaIndex = {
  readonly methods: readonly IndexedMethod[];
  readonly stats: IndexStats;
  readonly languages: readonly Language[];
  /** The id of each feature some method has. */
  readonly featureIds: ReadonlyMap<string, number>;
  /**
   * The paper's method-by-feature matrix, stored by feature: the methods that
   * have feature `f` at least once are `postings[postingOffsets[f]]` up to,
   * not including, `postings[postingOffsets[f + 1]]`.
   */
  readonly postingOffsets: Int32Array;
  readonly postings: Int32Array;
  /** The source of each file that has an indexed method, for showing recommendations. */
  readonly sources: ReadonlyMap<string, string>;
};

export type IndexOptions = {
  /** Language front ends; Python and TypeScript/JavaScript when omitted. */
  languages?: readonly Language[];
  /** Files with more characters are skipped, which keeps bundles and data files out. */
  maxFileLength?: number;
};

const MAX_FILE_LENGTH = 1_000_000;

/**
 * Featurize every method of the given files (the indexing stage of Section 3).
 * Files of unknown languages are skipped. A method that repeats an earlier
 * method's tokens, local variables, and nesting is recorded as a copy of it
 * and not indexed again, so that a recommendation always comes from different
 * pieces of code (Section 4.1).
 */
export function buildIndex(files: Iterable<SourceFile>, options: IndexOptions = {}): AromaIndex {
  const languages = options.languages ?? LANGUAGES;
  const maxFileLength = options.maxFileLength ?? MAX_FILE_LENGTH;
  const featureIds = new Map<string, number>();
  const methods: IndexedMethod[] = [];
  const sources = new Map<string, string>();
  const seen = new Map<string, IndexedMethod>();
  const stats: IndexStats = {
    files: 0,
    methods: 0,
    duplicateMethods: 0,
    features: 0,
    unsupportedFiles: 0,
    oversizedFiles: 0,
  };

  for (const file of files) {
    const language = languageForPath(languages, file.path);
    if (!language) {
      stats.unsupportedFiles += 1;
      continue;
    }
    if (file.source.length > maxFileLength) {
      stats.oversizedFiles += 1;
      continue;
    }
    stats.files += 1;
    for (const [ordinal, method] of language.parseMethods(file.source, file.path).entries()) {
      const tokens = featurize(method.body, language);
      if (tokens.length === 0) {
        continue;
      }
      sources.set(file.path, file.source);
      const location: MethodLocation = {
        path: file.path,
        name: method.name,
        language: language.id,
        startLine: method.startLine,
        endLine: method.endLine,
        tokenLines: Uint32Array.from(tokens, (entry) => entry.token.line),
        tokenEndLines: Uint32Array.from(tokens, (entry) => entry.token.endLine),
        ordinal,
      };
      const key = `${language.id}\n${digest(method.body)}`;
      const earlier = seen.get(key);
      if (earlier) {
        earlier.copies.push(location);
        stats.duplicateMethods += 1;
        continue;
      }
      const features: number[] = [];
      const offsets = new Uint32Array(tokens.length + 1);
      tokens.forEach((entry, position) => {
        for (const feature of entry.features) {
          let id = featureIds.get(feature);
          if (id === undefined) {
            id = featureIds.size;
            featureIds.set(feature, id);
          }
          features.push(id);
        }
        offsets[position + 1] = features.length;
      });
      const indexed = { ...location, features: Int32Array.from(features), offsets, copies: [] };
      seen.set(key, indexed);
      methods.push(indexed);
    }
  }
  stats.methods = methods.length;
  stats.features = featureIds.size;
  return { methods, stats, languages, featureIds, sources, ...invert(methods, featureIds.size) };
}

/** For each feature, the methods that have it, in ascending order. */
function invert(methods: readonly IndexedMethod[], featureCount: number) {
  const lastMethod = new Int32Array(featureCount).fill(-1);
  const postingOffsets = new Int32Array(featureCount + 1);
  methods.forEach((method, id) => {
    for (const feature of method.features) {
      if (lastMethod[feature] !== id) {
        lastMethod[feature] = id;
        postingOffsets[feature + 1]! += 1;
      }
    }
  });
  for (let feature = 0; feature < featureCount; feature += 1) {
    postingOffsets[feature + 1]! += postingOffsets[feature]!;
  }
  const postings = new Int32Array(postingOffsets[featureCount]!);
  const next = postingOffsets.slice(0, featureCount);
  lastMethod.fill(-1);
  methods.forEach((method, id) => {
    for (const feature of method.features) {
      if (lastMethod[feature] !== id) {
        lastMethod[feature] = id;
        postings[next[feature]!] = id;
        next[feature]! += 1;
      }
    }
  });
  return { postingOffsets, postings };
}

/**
 * A hash of everything a method's features are computed from: its tokens,
 * which of them are keywords and local variables, and how they nest.
 */
function digest(body: Node): string {
  const hash = createHash("sha256");
  const visit = (node: Node) => {
    if (node.kind === "token") {
      hash.update(node.keyword ? "k" : node.local ? "l" : "n");
      hash.update(node.text).update("\0");
    } else {
      hash.update("(");
      node.children.forEach(visit);
      hash.update(")");
    }
  };
  visit(body);
  return hash.digest("base64");
}

/** A code snippet to search for, featurized against one index. */
export type Query = {
  language: string;
  /** The query's features that some method of the index has. */
  features: Multiset;
  /** How many features the query has, counting repeats and ones the index has never seen. */
  size: number;
  /** The method a query was cut from, which searches leave out. */
  origin?: MethodRef;
  /** The lines of `origin` the query covers. */
  lines?: number[];
};

function toQuery(index: AromaIndex, language: string, tokens: TokenFeatures[]): Query {
  const features = new Map<number, number>();
  let size = 0;
  for (const entry of tokens) {
    for (const feature of entry.features) {
      size += 1;
      const id = index.featureIds.get(feature);
      if (id !== undefined) {
        features.set(id, (features.get(id) ?? 0) + 1);
      }
    }
  }
  return { language, features, size };
}

/**
 * A query from a piece of code on its own, as the paper takes one. The snippet
 * need not be a whole statement or method. Returns undefined when the language
 * is unknown to the index or the snippet has no names or literals.
 */
export function queryFromSnippet(
  index: AromaIndex,
  source: string,
  options: SnippetOptions & { language?: string },
): Query | undefined {
  const language =
    index.languages.find((candidate) => candidate.id === options.language) ??
    (options.path === undefined ? undefined : languageForPath(index.languages, options.path));
  const tree = language?.parseSnippet(source, options);
  if (!language || !tree) {
    return undefined;
  }
  const tokens = featurize(tree, language);
  return tokens.length === 0 ? undefined : toQuery(index, language.id, tokens);
}

/**
 * One query per method of a file that has code on the given lines: the snippet
 * made of the tokens on those lines, which keep the ancestors and the local
 * variables they have in their method. This is how to ask about changed lines
 * of a file in the checkout the index was built from. Lines outside every
 * method produce no query.
 */
export function queriesFromLines(
  index: AromaIndex,
  file: SourceFile,
  lines: Iterable<number>,
): Query[] {
  const language = languageForPath(index.languages, file.path);
  if (!language) {
    return [];
  }
  const wanted = new Set(lines);
  const queries: Query[] = [];
  for (const method of language.parseMethods(file.source, file.path)) {
    const covered = new Set<number>();
    const tokens = featurize(method.body, {
      memberAccessLabels: language.memberAccessLabels,
      select: (token) => {
        let selected = false;
        for (let line = token.line; line <= token.endLine; line += 1) {
          if (wanted.has(line)) {
            covered.add(line);
            selected = true;
          }
        }
        return selected;
      },
    });
    if (tokens.length > 0) {
      queries.push({
        ...toQuery(index, language.id, tokens),
        origin: {
          path: file.path,
          name: method.name,
          language: language.id,
          startLine: method.startLine,
          endLine: method.endLine,
        },
        lines: [...covered].sort((a, b) => a - b),
      });
    }
  }
  return queries;
}
