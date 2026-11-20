import { label, type Node, type Token, type Tree } from "./tree.ts";

/** What every local variable is called in a feature, so renaming one changes nothing. */
export const VAR = "#VAR";

const SEPARATOR = "\u001f";
/** Past this length a literal's features keep its start and its length, not its whole text. */
const MAX_NAME_LENGTH = 48;

/** The token itself. */
export function tokenFeature(name: string): string {
  return `T${SEPARATOR}${name}`;
}

/**
 * The token under an ancestor: `index` is the 1-based position, among the
 * ancestor's non-keyword children, of the child that leads to the token. The
 * parent, grandparent, and great-grandparent all produce this one kind.
 */
export function parentFeature(name: string, index: number, ancestorLabel: string): string {
  return `P${SEPARATOR}${name}${SEPARATOR}${index}${SEPARATOR}${ancestorLabel}`;
}

/** Two tokens with no other non-keyword token between them. */
export function siblingFeature(previous: string, next: string): string {
  return `S${SEPARATOR}${previous}${SEPARATOR}${next}`;
}

/** The contexts of two consecutive uses of one local variable. */
export function usageFeature(previousContext: string, nextContext: string): string {
  return `U${SEPARATOR}${previousContext}${SEPARATOR}${nextContext}`;
}

/** The context of a variable that is the `index`th non-keyword child of a tree. */
export function positionContext(index: number, parentLabel: string): string {
  return `${index}:${parentLabel}`;
}

/** The context of a variable in a member access: the member's name. */
export function tokenContext(name: string): string {
  return `.${name}`;
}

export type TokenFeatures = { token: Token; features: string[] };

export type FeaturizeOptions = {
  /** Labels of a member access, where a variable's context is the member's name. */
  memberAccessLabels?: ReadonlySet<string> | undefined;
  /**
   * Featurize the snippet made of only these tokens: neighbors and consecutive
   * uses are found among them, and their ancestors are the tree's.
   */
  select?: ((token: Token) => boolean) | undefined;
};

const MEMBER_ACCESS_LABELS: ReadonlySet<string> = new Set(["#.#"]);

type Frame = {
  tree: Tree;
  label: string;
  /** Position of this tree among its parent's non-keyword children. */
  index: number;
  parent: Frame | undefined;
};

type Leaf = { token: Token; name: string; index: number; parent: Frame | undefined };

/**
 * The features of each non-keyword token of a simplified parse tree, in source
 * order (Section 3.2): the token, its place under up to three ancestors, its
 * neighbors, and, for a local variable, how its previous and next uses relate.
 * A snippet's features are the multiset union of its tokens' features.
 */
export function featurize(root: Node, options: FeaturizeOptions = {}): TokenFeatures[] {
  const memberAccessLabels = options.memberAccessLabels ?? MEMBER_ACCESS_LABELS;
  const leaves: Leaf[] = [];
  const visit = (node: Node, index: number, parent: Frame | undefined) => {
    if (node.kind === "token") {
      if (!node.keyword) {
        leaves.push({ token: node, name: node.local ? VAR : clip(node.text), index, parent });
      }
      return;
    }
    const frame: Frame = { tree: node, label: label(node), index, parent };
    let position = 0;
    for (const child of node.children) {
      if (child.kind === "tree" || !child.keyword) {
        position += 1;
        visit(child, position, frame);
      }
    }
  };
  visit(root, 1, undefined);
  const select = options.select;
  const chosen = select ? leaves.filter((leaf) => select(leaf.token)) : leaves;

  const memberNames = new Map<Tree, string | undefined>();
  const contextOf = (leaf: Leaf): string => {
    const parent = leaf.parent;
    if (!parent) {
      return positionContext(leaf.index, "");
    }
    if (memberAccessLabels.has(parent.label)) {
      if (!memberNames.has(parent.tree)) {
        memberNames.set(parent.tree, firstOtherName(parent.tree));
      }
      const member = memberNames.get(parent.tree);
      if (member !== undefined) {
        return tokenContext(member);
      }
    }
    return positionContext(leaf.index, parent.label);
  };

  const result: TokenFeatures[] = chosen.map((leaf) => {
    const features = [tokenFeature(leaf.name)];
    let index = leaf.index;
    let ancestor = leaf.parent;
    for (let level = 0; level < 3 && ancestor; level += 1) {
      features.push(parentFeature(leaf.name, index, ancestor.label));
      index = ancestor.index;
      ancestor = ancestor.parent;
    }
    return { token: leaf.token, features };
  });

  const lastUse = new Map<string, number>();
  chosen.forEach((leaf, position) => {
    const next = chosen[position + 1];
    if (next) {
      const pair = siblingFeature(leaf.name, next.name);
      result[position]!.features.push(pair);
      result[position + 1]!.features.push(pair);
    }
    if (!leaf.token.local) {
      return;
    }
    const previous = lastUse.get(leaf.token.text);
    if (previous !== undefined) {
      const pair = usageFeature(contextOf(chosen[previous]!), contextOf(leaf));
      result[previous]!.features.push(pair);
      result[position]!.features.push(pair);
    }
    lastUse.set(leaf.token.text, position);
  });
  return result;
}

/** The first non-keyword token under a tree that is not a local variable. */
function firstOtherName(tree: Tree): string | undefined {
  for (const child of tree.children) {
    if (child.kind === "tree") {
      const found = firstOtherName(child);
      if (found !== undefined) {
        return found;
      }
    } else if (!child.keyword && !child.local) {
      return clip(child.text);
    }
  }
  return undefined;
}

function clip(text: string): string {
  return text.length <= MAX_NAME_LENGTH
    ? text
    : `${text.slice(0, MAX_NAME_LENGTH)}${SEPARATOR}${text.length}`;
}
