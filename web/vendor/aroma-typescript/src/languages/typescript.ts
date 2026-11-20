import type { SyntaxNode } from "@lezer/common";
import { parser } from "@lezer/javascript";

import type { Language, ParsedMethod } from "../language.ts";
import {
  children,
  descendants,
  lineIndex,
  lineSpan,
  looksGlobal,
  simplify,
  type Grammar,
} from "./lezer.ts";

const GRAMMAR: Grammar = {
  names: new Set([
    "VariableName",
    "VariableDefinition",
    "PropertyName",
    "PropertyDefinition",
    "PrivatePropertyName",
    "PrivatePropertyDefinition",
    "TypeName",
    "TypeDefinition",
    "Label",
    "Number",
    "String",
    "RegExp",
    "BooleanLiteral",
    "null",
    "JSXIdentifier",
    "JSXText",
    "JSXAttributeValue",
  ]),
  text: new Set(["TemplateString", "TemplateType"]),
  comments: new Set(["LineComment", "BlockComment", "Hashbang"]),
};

const VARIABLES = new Set(["VariableName", "VariableDefinition"]);
const FUNCTIONS = new Set([
  "FunctionDeclaration",
  "FunctionExpression",
  "ArrowFunction",
  "MethodDeclaration",
]);
/** Nodes that name the function they hold, and the child that is the name. */
const NAMED: Record<string, readonly string[]> = {
  FunctionDeclaration: ["VariableDefinition"],
  FunctionExpression: ["VariableDefinition"],
  ClassDeclaration: ["VariableDefinition"],
  ClassExpression: ["VariableDefinition"],
  VariableDeclaration: ["VariableDefinition"],
  MethodDeclaration: ["PropertyDefinition", "PrivatePropertyDefinition"],
  PropertyDeclaration: ["PropertyDefinition", "PrivatePropertyDefinition"],
  Property: ["PropertyDefinition"],
};

const PARSERS = {
  ts: parser.configure({ dialect: "ts" }),
  tsx: parser.configure({ dialect: "ts jsx" }),
  jsx: parser.configure({ dialect: "jsx" }),
};

function parserFor(path: string | undefined) {
  if (path === undefined || /\.[cm]?ts$/.test(path)) {
    return PARSERS.ts;
  }
  return path.endsWith(".tsx") ? PARSERS.tsx : PARSERS.jsx;
}

/** A function, or an object literal's method, which Lezer parses as a property with parameters. */
function isFunction(node: { name: string; node: SyntaxNode }): boolean {
  return (
    FUNCTIONS.has(node.name) ||
    (node.name === "Property" && node.node.getChild("ParamList") !== null)
  );
}

/**
 * The names a node declares anywhere inside it, which are its local variables;
 * Lezer marks each declaration site. Imported names are kept apart: an import
 * names the same thing in every file, so it is never local.
 */
function namesUnder(source: string, root: SyntaxNode) {
  const declared = new Set<string>();
  const imported = new Set<string>();
  descendants(root, (cursor) => {
    if (cursor.name !== "VariableDefinition") {
      return;
    }
    const parent = cursor.node.parent;
    const isImport =
      parent?.name === "ImportDeclaration" || parent?.parent?.name === "ImportDeclaration";
    (isImport ? imported : declared).add(source.slice(cursor.from, cursor.to));
  });
  return { declared, imported };
}

/** What a function is bound to, outermost name first, such as `Cache.clear`. */
function nameOf(source: string, node: SyntaxNode): string {
  const parts: string[] = [];
  let inner: SyntaxNode | undefined;
  for (let at: SyntaxNode | null = node; at; inner = at, at = at.parent) {
    const naming = NAMED[at.name];
    const from = inner?.from ?? Infinity;
    // One declaration can bind several names; the function's is the nearest one before it.
    const name =
      naming && children(at).findLast((child) => naming.includes(child.name) && child.to <= from);
    if (name) {
      parts.unshift(source.slice(name.from, name.to));
    }
  }
  return parts.length === 0 ? "<anonymous>" : parts.join(".");
}

function methodsOf(source: string, path: string): ParsedMethod[] {
  const lineOf = lineIndex(source);
  const methods: ParsedMethod[] = [];
  const cursor = parserFor(path).parse(source).cursor();
  const walk = () => {
    if (isFunction(cursor)) {
      const definition = cursor.node;
      // A body is a block or, for an arrow function, the expression after the
      // arrow. Overloads and abstract methods have neither.
      const body = definition.lastChild;
      if (!body || (body.name !== "Block" && definition.name !== "ArrowFunction")) {
        return;
      }
      const { declared } = namesUnder(source, definition);
      const tree = simplify(
        source,
        body,
        GRAMMAR,
        lineOf,
        (name) => VARIABLES.has(name.name) && declared.has(source.slice(name.from, name.to)),
      );
      if (tree) {
        methods.push({
          name: nameOf(source, definition),
          ...lineSpan(source, definition, lineOf),
          body: tree,
        });
      }
      return;
    }
    if (cursor.firstChild()) {
      do {
        walk();
      } while (cursor.nextSibling());
      cursor.parent();
    }
  };
  walk();
  return methods;
}

function isCallee(node: SyntaxNode): boolean {
  const parent = node.parent?.name;
  return (
    (parent === "CallExpression" && node.prevSibling === null) ||
    (parent === "NewExpression" && node.prevSibling?.name === "new")
  );
}

/** TypeScript and JavaScript, with JSX in `.tsx`, `.jsx`, and `.js` files. */
export const typescript: Language = {
  id: "typescript",
  extensions: [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"],
  memberAccessLabels: new Set(["#.#", "#?.#"]),
  parseMethods: methodsOf,
  parseSnippet(source, options = {}) {
    const root = parserFor(options.path).parse(source).topNode;
    const { declared, imported } = namesUnder(source, root);
    return simplify(source, root, GRAMMAR, lineIndex(source), (name) => {
      if (!VARIABLES.has(name.name)) {
        return false;
      }
      const word = source.slice(name.from, name.to);
      if (declared.has(word)) {
        return true;
      }
      // A name the snippet never declares: a variable from the code above it,
      // unless it is imported, called, capitalized, or named as a global.
      return !(imported.has(word) || looksGlobal(word, options.globals) || isCallee(name.node));
    });
  },
};
