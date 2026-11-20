/**
 * Aroma: code recommendation via structural code search (Luan et al., OOPSLA
 * 2019, https://arxiv.org/abs/1812.01158). Given a snippet, it finds the
 * methods of a corpus that contain code like it and recommends the code those
 * methods share around it. See README.md for how to call it.
 */
export {
  buildIndex,
  queriesFromLines,
  queryFromSnippet,
  type AromaIndex,
  type IndexOptions,
  type IndexStats,
  type MethodRef,
  type Query,
  type SourceFile,
} from "./corpus.ts";
export type { Language, ParsedMethod, SnippetOptions } from "./language.ts";
export { LANGUAGES } from "./languages/index.ts";
export {
  recommend,
  type Recommendation,
  type RecommendedLine,
  type RecommendOptions,
} from "./recommend.ts";
export { search, type SearchOptions, type SearchResult } from "./search.ts";
