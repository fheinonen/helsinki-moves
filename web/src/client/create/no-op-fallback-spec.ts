import type { Spec } from "@json-render/core";

function collectModeLines(prompt: string, mode: "tram" | "bus"): string[] {
  const values = new Set<string>();
  const listPattern = new RegExp(`\\b${mode}\\s+lines?\\s+([\\d\\s,and]+)`, "gi");
  const singlePattern = new RegExp(`\\b${mode}\\s+(\\d+)\\b`, "gi");

  for (const match of prompt.matchAll(listPattern)) {
    for (const value of String(match[1] || "").match(/\d+/g) || []) {
      values.add(value);
    }
  }

  for (const match of prompt.matchAll(singlePattern)) {
    values.add(String(match[1]));
  }

  return [...values];
}

function formatModeTitle(label: string, lines: string[]): string | null {
  if (lines.length === 0) {
    return null;
  }
  return `${label} ${lines.join(", ")}`;
}

function buildTitleFromPrompt(prompt: string): string | null {
  const tramTitle = formatModeTitle("Tram", collectModeLines(prompt, "tram"));
  const busTitle = formatModeTitle("Bus", collectModeLines(prompt, "bus"));
  return [tramTitle, busTitle].filter(Boolean).join(" and ") || null;
}

export function buildNoOpFallbackSpec(prompt: string, baseSpec: Spec): Spec | null {
  const title = buildTitleFromPrompt(prompt);
  if (!title) {
    return null;
  }

  return {
    ...baseSpec,
    elements: {
      ...baseSpec.elements,
      board: {
        ...baseSpec.elements.board,
        props: {
          ...(baseSpec.elements.board?.props || {}),
          title,
        },
      },
    },
  };
}
