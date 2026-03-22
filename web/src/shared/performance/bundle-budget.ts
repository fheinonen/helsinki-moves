export interface BundleAssetSummaryInput {
  fileName: string;
  gzipBytes: number;
  type: "css" | "js";
}

export interface BundleBudgetViolation {
  actualBytes: number;
  budgetBytes: number;
  label: string;
  type: "css" | "js";
}

export interface BundleBudgetSummary {
  cssGzipBytes: number;
  jsGzipBytes: number;
  violations: BundleBudgetViolation[];
}

export const BUNDLE_BUDGETS = {
  cssGzipBytes: 40 * 1024,
  jsGzipBytes: 150 * 1024,
};

export function summarizeBundleBudgets(
  assets: BundleAssetSummaryInput[],
  budgets = BUNDLE_BUDGETS
): BundleBudgetSummary {
  const summary: BundleBudgetSummary = {
    cssGzipBytes: 0,
    jsGzipBytes: 0,
    violations: [],
  };

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
