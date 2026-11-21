import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { auditTestHygiene } from "./test-hygiene-core.mjs";

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(webRoot, "..");

function toRepoPath(absolutePath) {
  return path.relative(repoRoot, absolutePath).split(path.sep).join("/");
}

function readFilesRecursive(dirPath, filterFn = () => true) {
  if (!fs.existsSync(dirPath)) {
    return [];
  }
  const files = [];
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const entryPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      if (!entry.name.endsWith("-snapshots")) {
        files.push(...readFilesRecursive(entryPath, filterFn));
      }
      continue;
    }
    if (filterFn(entryPath)) {
      files.push({
        content: fs.readFileSync(entryPath, "utf8"),
        path: toRepoPath(entryPath),
      });
    }
  }
  return files;
}

function readSnapshotDirs(e2eDir) {
  if (!fs.existsSync(e2eDir)) {
    return [];
  }
  return fs
    .readdirSync(e2eDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.endsWith("-snapshots"))
    .map((entry) => {
      const dirPath = path.join(e2eDir, entry.name);
      return {
        files: fs.readdirSync(dirPath).sort(),
        path: toRepoPath(dirPath),
      };
    });
}

function readPackageScripts() {
  const pkgPath = path.join(webRoot, "package.json");
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  return pkg.scripts ?? {};
}

const snapshot = {
  cliBddFiles: readFilesRecursive(path.join(repoRoot, "cli/tests/bdd")),
  e2eFiles: readFilesRecursive(path.join(webRoot, "tests/e2e")),
  helperFiles: readFilesRecursive(path.join(webRoot, "tests/helpers")),
  packageScripts: readPackageScripts(),
  smokeFiles: readFilesRecursive(path.join(webRoot, "tests/smoke")),
  snapshotDirs: readSnapshotDirs(path.join(webRoot, "tests/e2e")),
  unitFiles: readFilesRecursive(path.join(webRoot, "tests/unit")),
};

const { violations } = auditTestHygiene(snapshot);

if (violations.length > 0) {
  for (const violation of violations) {
    process.stderr.write(`[${violation.code}] ${violation.file}: ${violation.message}\n`);
  }
  process.exitCode = 1;
}
