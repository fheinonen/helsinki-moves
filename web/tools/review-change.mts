import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { reviewChanges, type ChangeReview, type CorpusFile } from "../src/review/review.ts";

const USAGE = "usage: node tools/review-change.mts --corpus <dir> --change <file> --lines <n,n>";
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".py"]);

interface ReviewArgs {
  corpus: string;
  change: string;
  lines: number[];
}

function parseArgs(argv: readonly string[]): ReviewArgs | undefined {
  const values = readFlags(argv);
  const lines = parseLines(values?.get("lines"));
  const corpus = values?.get("corpus");
  const change = values?.get("change");
  if (values === undefined || corpus === undefined || change === undefined || lines === undefined) {
    return undefined;
  }
  return { corpus, change, lines };
}

function readFlags(argv: readonly string[]): Map<string, string> | undefined {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (key === undefined || !key.startsWith("--") || value === undefined) {
      return undefined;
    }
    values.set(key.slice(2), value);
  }
  return values;
}

function parseLines(text: string | undefined): number[] | undefined {
  if (text === undefined || text.length === 0) {
    return undefined;
  }
  const lines = text.split(",").map((part) => Number(part));
  if (lines.some((line) => !Number.isInteger(line) || line < 1)) {
    return undefined;
  }
  return lines;
}

async function collectSources(root: string, directory: string, files: CorpusFile[]): Promise<void> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === "node_modules") {
      continue;
    }
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await collectSources(root, fullPath, files);
      continue;
    }
    if (!SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
      continue;
    }
    files.push({
      path: path.relative(root, fullPath).split(path.sep).join("/"),
      source: await readFile(fullPath, "utf8"),
    });
  }
}

function render(reviews: readonly ChangeReview[]): string {
  const lines = reviews.flatMap(renderReview);
  if (lines.length === 0) {
    return "";
  }
  return `${lines.join("\n")}\n`;
}

function renderReview(review: ChangeReview): string[] {
  return [
    review.methodName,
    ...review.similar.map(
      (method) => `similar ${method.name} ${method.path}:${method.startLine}-${method.endLine}`
    ),
    ...review.recommendations.flatMap((recommendation) => recommendation.added.map((line) => `added ${line}`)),
  ];
}

const args = parseArgs(process.argv.slice(2));
if (args === undefined) {
  process.stderr.write(`${USAGE}\n`);
  process.exit(1);
}

const files: CorpusFile[] = [];
await collectSources(args.corpus, args.corpus, files);
const changePath = args.change.split(path.sep).join("/");
const source = await readFile(path.join(args.corpus, changePath), "utf8");
process.stdout.write(
  render(reviewChanges(files, [{ path: changePath, source, lines: args.lines }]))
);
