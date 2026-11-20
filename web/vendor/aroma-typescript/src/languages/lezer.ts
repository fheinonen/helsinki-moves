import type { SyntaxNode, TreeCursor } from "@lezer/common";

import type { Node, Token } from "../tree.ts";

/** What a Lezer grammar's node types mean for a simplified parse tree. */
export type Grammar = {
  /** Node types that are a single name or literal, whatever is inside them. */
  names: ReadonlySet<string>;
  /** Node types whose text between children is literal content, such as a template string. */
  text: ReadonlySet<string>;
  comments: ReadonlySet<string>;
  /** Other nodes to leave out, such as docstrings. */
  skip?: (node: TreeCursor) => boolean;
};

/** The 1-based line of a character offset. */
export function lineIndex(source: string): (offset: number) => number {
  const starts = [0];
  for (let at = source.indexOf("\n"); at !== -1; at = source.indexOf("\n", at + 1)) {
    starts.push(at + 1);
  }
  return (offset) => {
    let low = 0;
    let high = starts.length - 1;
    while (low < high) {
      const middle = (low + high + 1) >> 1;
      if (starts[middle]! <= offset) {
        low = middle;
      } else {
        high = middle - 1;
      }
    }
    return low + 1;
  };
}

/** The lines a node spans, not counting whitespace after its last token. */
export function lineSpan(
  source: string,
  node: { from: number; to: number },
  lineOf: (offset: number) => number,
): { startLine: number; endLine: number } {
  let end = node.to;
  while (end > node.from + 1 && /\s/.test(source[end - 1]!)) {
    end -= 1;
  }
  return { startLine: lineOf(node.from), endLine: lineOf(end - 1) };
}

/**
 * The simplified parse tree of a Lezer syntax node. Lezer keeps a node for
 * every name, literal, and keyword and drops some punctuation, so the text
 * between a node's children is the rest of its keyword tokens. A node left
 * with one name or one subtree is replaced by it.
 *
 * @param isLocal Whether a node of one of the grammar's name types is a local variable.
 */
export function simplify(
  source: string,
  root: SyntaxNode,
  grammar: Grammar,
  lineOf: (offset: number) => number,
  isLocal: (node: TreeCursor) => boolean,
): Node | undefined {
  const token = (from: number, to: number, keyword: boolean, local: boolean): Token => ({
    kind: "token",
    text: keyword ? source.slice(from, to) : source.slice(from, to).trim(),
    keyword,
    local,
    line: lineOf(from),
    endLine: lineOf(Math.max(from, to - 1)),
  });
  const cursor = root.cursor();

  /** Converts the node the cursor is on, and leaves the cursor there. */
  const convert = (): Node | undefined => {
    const { name, from, to } = cursor;
    if (grammar.comments.has(name) || grammar.skip?.(cursor)) {
      return undefined;
    }
    if (grammar.names.has(name)) {
      return source.slice(from, to).trim() === ""
        ? undefined
        : token(from, to, false, isLocal(cursor));
    }
    const isError = cursor.type.isError;
    if (!cursor.firstChild()) {
      // Text the parser could not place is a name, so that it does not become part of a label.
      return from === to ? undefined : token(from, to, !isError, false);
    }
    const children: Node[] = [];
    const literal = grammar.text.has(name);
    const gap = (start: number, end: number) => {
      if (literal) {
        if (source.slice(start, end).trim() !== "") {
          children.push(token(start, end, false, false));
        }
        return;
      }
      for (const match of source.slice(start, end).matchAll(/\S+/g)) {
        // A backslash that continues a line is not a token.
        if (match[0] !== "\\") {
          const at = start + match.index;
          children.push(token(at, at + match[0].length, true, false));
        }
      }
    };
    let at = from;
    do {
      gap(at, cursor.from);
      at = cursor.to;
      const child = convert();
      if (child) {
        children.push(child);
      }
    } while (cursor.nextSibling());
    cursor.parent();
    gap(at, to);

    if (children.length === 0) {
      return undefined;
    }
    const only = children[0]!;
    if (children.length === 1 && (only.kind === "tree" || !only.keyword)) {
      return only;
    }
    return { kind: "tree", children };
  };
  return convert();
}

/** Calls `visit` for every node under `root`, with the cursor on the node. */
export function descendants(root: SyntaxNode, visit: (cursor: TreeCursor) => void): void {
  const cursor = root.cursor();
  if (!cursor.firstChild()) {
    return;
  }
  let depth = 1;
  for (;;) {
    visit(cursor);
    if (cursor.firstChild()) {
      depth += 1;
      continue;
    }
    while (!cursor.nextSibling()) {
      cursor.parent();
      depth -= 1;
      if (depth === 0) {
        return;
      }
    }
  }
}

export function children(node: SyntaxNode): SyntaxNode[] {
  const result: SyntaxNode[] = [];
  for (let child = node.firstChild; child; child = child.nextSibling) {
    result.push(child);
  }
  return result;
}

/**
 * Whether a name a snippet uses without declaring it reads as a global: a
 * capitalized name, which is a class, component, or constant by convention,
 * or one the caller says is global. Other undeclared names are taken to be
 * local variables declared above the snippet.
 */
export function looksGlobal(name: string, globals: ReadonlySet<string> | undefined): boolean {
  return /^[A-Z]/.test(name) || globals?.has(name) === true;
}

/** Lines without the indentation they all share, so an indented fragment parses. */
export function dedent(source: string): string {
  const lines = source.split("\n");
  const indents = lines
    .filter((line) => line.trim() !== "")
    .map((line) => line.length - line.trimStart().length);
  const common = indents.length === 0 ? 0 : Math.min(...indents);
  return lines.map((line) => line.slice(common)).join("\n");
}
