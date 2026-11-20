import type { SyntaxNode, TreeCursor } from "@lezer/common";
import { parser } from "@lezer/python";

import type { Language, ParsedMethod } from "../language.ts";
import {
  children,
  dedent,
  descendants,
  lineIndex,
  lineSpan,
  looksGlobal,
  simplify,
  type Grammar,
} from "./lezer.ts";

const STRINGS = new Set(["String", "ContinuedString"]);

const GRAMMAR: Grammar = {
  names: new Set([
    "VariableName",
    "PropertyName",
    "Number",
    "Boolean",
    "None",
    "Ellipsis",
    ...STRINGS,
  ]),
  text: new Set(["FormatString"]),
  comments: new Set(["Comment"]),
  // A statement that is only a string is a docstring, which is a comment.
  skip: (node) => node.name === "ExpressionStatement" && isOnlyString(node.node),
};

function isOnlyString(statement: SyntaxNode): boolean {
  const first = statement.firstChild;
  return first !== null && first.nextSibling === null && STRINGS.has(first.name);
}

const PATTERNS = new Set(["TupleExpression", "ArrayExpression", "ParenthesizedExpression"]);
const LOOPS = new Set([
  "ForStatement",
  "ComprehensionExpression",
  "ArrayComprehensionExpression",
  "DictionaryComprehensionExpression",
  "SetComprehensionExpression",
]);

type Names = {
  /** Names bound inside the scope: its local variables. */
  bound: Set<string>;
  /** Names the scope imports or declares `global`, which are never local. */
  outer: Set<string>;
};

/**
 * The names bound anywhere under a node: parameters, assignment and loop
 * targets, `with` and `except` aliases, and nested functions and classes.
 * Python has no declarations, so these are a function's local variables.
 */
function namesUnder(source: string, root: SyntaxNode): Names {
  const bound = new Set<string>();
  const outer = new Set<string>();
  const text = (node: SyntaxNode) => source.slice(node.from, node.to);
  const bind = (target: SyntaxNode | null | undefined) => {
    if (!target) {
      return;
    }
    if (target.name === "VariableName") {
      bound.add(text(target));
    } else if (PATTERNS.has(target.name)) {
      children(target).forEach(bind);
    }
  };
  const after = (nodes: SyntaxNode[], keyword: string) =>
    nodes.filter((_, position) => nodes[position - 1]?.name === keyword);

  descendants(root, (cursor) => {
    const name = cursor.name;
    if (name === "ParamList") {
      const parameters = children(cursor.node);
      parameters
        .filter((_, position) => parameters[position - 1]?.name !== "AssignOp")
        .forEach(bind);
    } else if (name === "AssignStatement") {
      const parts = children(cursor.node);
      const last = parts.findLastIndex((part) => part.name === "AssignOp");
      parts.slice(0, Math.max(last, 0)).forEach(bind);
    } else if (name === "UpdateStatement" || name === "NamedExpression") {
      bind(cursor.node.firstChild);
    } else if (LOOPS.has(name)) {
      let binding = false;
      for (const part of children(cursor.node)) {
        if (part.name === "for" || part.name === "in") {
          binding = part.name === "for";
        } else if (binding) {
          bind(part);
        }
      }
    } else if (name === "WithStatement" || name === "TryStatement") {
      after(children(cursor.node), "as").forEach(bind);
    } else if (name === "FunctionDefinition") {
      after(children(cursor.node), "def").forEach(bind);
    } else if (name === "ClassDefinition") {
      after(children(cursor.node), "class").forEach(bind);
    } else if (name === "CapturePattern") {
      bind(cursor.node.firstChild);
    } else if (name === "AsPattern") {
      bind(cursor.node.lastChild);
    } else if (name === "ScopeStatement" && cursor.node.firstChild?.name === "nonlocal") {
      // The variable belongs to an enclosing function, which is part of the same method.
      children(cursor.node).forEach(bind);
    } else if (name === "ScopeStatement" || name === "ImportStatement") {
      for (const part of children(cursor.node)) {
        if (part.name === "VariableName") {
          outer.add(text(part));
        }
      }
    }
  });
  for (const name of outer) {
    bound.delete(name);
  }
  return { bound, outer };
}

/** A name before `=` in a call's arguments is a parameter's name, not a variable. */
function isKeywordArgument(node: SyntaxNode): boolean {
  return node.parent?.name === "ArgList" && node.nextSibling?.name === "AssignOp";
}

function isCallee(node: SyntaxNode): boolean {
  return node.parent?.name === "CallExpression" && node.prevSibling === null;
}

function methodsOf(source: string): ParsedMethod[] {
  const lineOf = lineIndex(source);
  const methods: ParsedMethod[] = [];
  const classes: string[] = [];
  const cursor = parser.parse(source).cursor();
  const text = (node: SyntaxNode | undefined) => (node ? source.slice(node.from, node.to) : "");
  const nameAfter = (node: SyntaxNode, keyword: string) =>
    text(children(node).find((child) => child.prevSibling?.name === keyword));

  const walk = () => {
    if (cursor.name === "FunctionDefinition") {
      const definition = cursor.node;
      const body = definition.lastChild;
      if (body?.name !== "Body") {
        return;
      }
      const { bound } = namesUnder(source, definition);
      const tree = simplify(
        source,
        body,
        GRAMMAR,
        lineOf,
        (name: TreeCursor) =>
          name.name === "VariableName" &&
          bound.has(source.slice(name.from, name.to)) &&
          !isKeywordArgument(name.node),
      );
      if (tree) {
        methods.push({
          name: [...classes, nameAfter(definition, "def")].join("."),
          ...lineSpan(source, definition, lineOf),
          body: tree,
        });
      }
      return;
    }
    if (cursor.name === "LambdaExpression") {
      return;
    }
    const isClass = cursor.name === "ClassDefinition";
    if (isClass) {
      classes.push(nameAfter(cursor.node, "class"));
    }
    if (cursor.firstChild()) {
      do {
        walk();
      } while (cursor.nextSibling());
      cursor.parent();
    }
    if (isClass) {
      classes.pop();
    }
  };
  walk();
  return methods;
}

export const python: Language = {
  id: "python",
  extensions: [".py"],
  parseMethods: methodsOf,
  parseSnippet(source, options = {}) {
    const text = dedent(source);
    const root = parser.parse(text).topNode;
    const { bound, outer } = namesUnder(text, root);
    return simplify(text, root, GRAMMAR, lineIndex(text), (name) => {
      if (name.name !== "VariableName") {
        return false;
      }
      const word = text.slice(name.from, name.to);
      if (bound.has(word)) {
        return !isKeywordArgument(name.node);
      }
      // A name the snippet never binds: a variable from the code above it,
      // unless it is imported, called, capitalized, or named as a global.
      const node = name.node;
      return !(
        outer.has(word) ||
        looksGlobal(word, options.globals) ||
        isKeywordArgument(node) ||
        isCallee(node)
      );
    });
  },
};
