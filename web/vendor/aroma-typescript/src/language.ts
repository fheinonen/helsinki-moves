import type { Node } from "./tree.ts";

/** One method of a source file: the unit Aroma indexes and recommends from. */
export type ParsedMethod = {
  /** A name for reports, such as `Class.method`. */
  name: string;
  /** 1-based lines the method spans. */
  startLine: number;
  endLine: number;
  /** The method's body. Parameters and the name are not part of it. */
  body: Node;
};

export type SnippetOptions = {
  /** A path whose extension picks a dialect, such as `.tsx` for JSX. */
  path?: string | undefined;
  /** Names to keep as they are when the snippet neither declares nor imports them. */
  globals?: ReadonlySet<string> | undefined;
};

/**
 * A language front end. Turning source into simplified parse trees is the only
 * language-specific step of Aroma; it needs the language's grammar, to tell
 * keyword tokens from the rest, and its scoping rules, to tell local variables
 * from globals. Everything after it works on the trees alone.
 */
export type Language = {
  /** Methods of different languages are never compared. */
  id: string;
  /** File extensions, with the dot, of the files this language parses. */
  extensions: readonly string[];
  /** Labels of a member access such as `x.f`; `#.#` when omitted. */
  memberAccessLabels?: ReadonlySet<string>;
  /** The methods of a file, outermost only, without comments. */
  parseMethods(source: string, path: string): ParsedMethod[];
  /** A code fragment that may not be a whole method, or undefined when it has no tokens. */
  parseSnippet(source: string, options?: SnippetOptions): Node | undefined;
};

/** The language whose extension a path ends with; the longest extension wins. */
export function languageForPath(
  languages: readonly Language[],
  path: string,
): Language | undefined {
  let best: Language | undefined;
  let bestLength = 0;
  for (const language of languages) {
    for (const extension of language.extensions) {
      if (path.endsWith(extension) && extension.length > bestLength) {
        best = language;
        bestLength = extension.length;
      }
    }
  }
  return best;
}
