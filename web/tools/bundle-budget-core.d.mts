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

export const BUNDLE_BUDGETS: {
  cssGzipBytes: number;
  jsGzipBytes: number;
};

export function formatBytes(bytes: number): string;

export function summarizeBundleBudgets(
  assets: BundleAssetSummaryInput[],
  budgets?: {
    cssGzipBytes: number;
    jsGzipBytes: number;
  }
): BundleBudgetSummary;
