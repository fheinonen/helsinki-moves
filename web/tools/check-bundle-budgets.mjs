import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import {
  BUNDLE_BUDGETS,
  formatBytes,
  summarizeBundleBudgets,
} from "./bundle-budget-core.mjs";

function getAssetType(fileName) {
  if (fileName.endsWith(".css")) {
    return "css";
  }
  if (fileName.endsWith(".js")) {
    return "js";
  }
  return null;
}

function readBundleAssets(distDir) {
  const assetsDir = path.resolve(distDir, "assets");
  const entries = fs.existsSync(assetsDir) ? fs.readdirSync(assetsDir) : [];

  return entries
    .map((entry) => {
      const type = getAssetType(entry);
      if (!type) {
        return null;
      }

      const filePath = path.resolve(assetsDir, entry);
      const gzipBytes = zlib.gzipSync(fs.readFileSync(filePath)).byteLength;
      return {
        fileName: entry,
        gzipBytes,
        type,
      };
    })
    .filter(Boolean);
}

function printSummary(summary) {
  process.stdout.write(
    [
      `JS gzip: ${formatBytes(summary.jsGzipBytes)} / ${formatBytes(BUNDLE_BUDGETS.jsGzipBytes)}`,
      `CSS gzip: ${formatBytes(summary.cssGzipBytes)} / ${formatBytes(BUNDLE_BUDGETS.cssGzipBytes)}`,
    ].join("\n") + "\n"
  );
}

const assets = readBundleAssets(path.resolve(process.cwd(), "dist"));
const summary = summarizeBundleBudgets(assets);

printSummary(summary);

if (summary.violations.length > 0) {
  for (const violation of summary.violations) {
    process.stderr.write(
      `${violation.label}: ${formatBytes(violation.actualBytes)} > ${formatBytes(violation.budgetBytes)}\n`
    );
  }
  process.exitCode = 1;
}
