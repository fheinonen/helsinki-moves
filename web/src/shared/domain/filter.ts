export interface FilterOption {
  count: number;
  value: string;
}

export interface FilterState {
  destinations: string[];
  lines: string[];
  stopId: string | null;
}

export function createEmptyFilterState(): FilterState {
  return {
    destinations: [],
    lines: [],
    stopId: null,
  };
}

export function countActiveFilters(filterState: FilterState): number {
  return (
    filterState.destinations.length +
    filterState.lines.length +
    (filterState.stopId ? 1 : 0)
  );
}

function normalizeValue(value: string | null | undefined): string | null {
  const normalized = String(value || "").trim();
  return normalized || null;
}

function sanitizeValues(values: string[], allowedValues: string[]): string[] {
  const allowed = new Set(allowedValues.map((value) => String(value || "").trim()).filter(Boolean));
  return values
    .map((value) => normalizeValue(value))
    .filter((value): value is string => Boolean(value && allowed.has(value)));
}

export function toggleFilterValue(values: string[], value: string): string[] {
  const normalizedValue = normalizeValue(value);
  if (!normalizedValue) {
    return values;
  }

  return values.includes(normalizedValue)
    ? values.filter((item) => item !== normalizedValue)
    : [...values, normalizedValue];
}

export function sanitizeFilterState(
  filterState: FilterState,
  options: {
    allowedDestinations: string[];
    allowedLines: string[];
    availableStopIds: string[];
    selectedStopId: string | null;
  }
): FilterState {
  const selectedStopId = normalizeValue(options.selectedStopId);
  const availableStopIds = new Set(
    options.availableStopIds.map((value) => normalizeValue(value)).filter(Boolean)
  );

  return {
    destinations: sanitizeValues(filterState.destinations, options.allowedDestinations),
    lines: sanitizeValues(filterState.lines, options.allowedLines),
    stopId:
      selectedStopId && availableStopIds.has(selectedStopId)
        ? selectedStopId
        : null,
  };
}

export function buildFilterSummary(
  filterState: FilterState,
  stopName: string | null
): string {
  const activeCount = countActiveFilters(filterState);
  if (activeCount === 0) {
    return stopName ? `${stopName} stop · no filters active` : "No filters active";
  }

  const activeLabel = activeCount === 1 ? "1 active filter" : `${activeCount} active filters`;
  return stopName ? `${stopName} stop · ${activeLabel}` : activeLabel;
}
