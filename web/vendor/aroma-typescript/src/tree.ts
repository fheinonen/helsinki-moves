/**
 * One token of a program. Keyword tokens are the ones a language fixes, such
 * as `if`, `{`, and `+`; every other token is a name or a literal.
 */
export type Token = {
  kind: "token";
  text: string;
  keyword: boolean;
  /** A name or literal that is a local variable, which featurizes as #VAR. */
  local: boolean;
  /** 1-based lines the token starts and ends on. */
  line: number;
  endLine: number;
};

/**
 * A simplified parse tree (Section 3.1 of the paper): a non-empty list of
 * tokens and subtrees, with no node types, so that every language has the same
 * representation. A list never holds a single subtree and nothing else.
 */
export type Tree = { kind: "tree"; children: Node[] };

export type Node = Token | Tree;

/** A tree's keyword tokens joined in order, with `#` for each other token and each subtree. */
export function label(tree: Tree): string {
  let text = "";
  for (const child of tree.children) {
    text += child.kind === "token" && child.keyword ? child.text : "#";
  }
  return text;
}
