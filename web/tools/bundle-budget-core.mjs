export const BUNDLE_BUDGETS = {
  cssGzipBytes: 40 * 1024,
  jsGzipBytes: 80 * 1024,
};

function createEmptySummary() {
  return {
    cssGzipBytes: 0,
    jsGzipBytes: 0,
    violations: [],
  };
}

export function summarizeBundleBudgets(
  assets,
  budgets = BUNDLE_BUDGETS
) {
  const summary = createEmptySummary();

  for (const asset of assets) {
    if (asset.type === "css") {
      summary.cssGzipBytes += asset.gzipBytes;
      continue;
    }
    if (asset.type === "js") {
      summary.jsGzipBytes += asset.gzipBytes;
    }
  }

  if (summary.jsGzipBytes > budgets.jsGzipBytes) {
    summary.violations.push({
      actualBytes: summary.jsGzipBytes,
      budgetBytes: budgets.jsGzipBytes,
      label: "JavaScript gzip budget exceeded",
      type: "js",
    });
  }

  if (summary.cssGzipBytes > budgets.cssGzipBytes) {
    summary.violations.push({
      actualBytes: summary.cssGzipBytes,
      budgetBytes: budgets.cssGzipBytes,
      label: "CSS gzip budget exceeded",
      type: "css",
    });
  }

  return summary;
}

export function formatBytes(bytes) {
  return `${(bytes / 1024).toFixed(1)} KiB`;
}
