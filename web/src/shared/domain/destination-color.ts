import { DESTINATION_COLORS, separateNeighbors } from "@shared/domain/destination-separation";

const FINNISH_LOCALE = "fi-FI";

export interface DestinationColorBook {
  colorsFor(destinations: readonly string[]): readonly string[];
}

export function createDestinationColorBook(): DestinationColorBook {
  const memory = new Map<string, number>();
  return {
    colorsFor(destinations) {
      const keys = destinations.map(destinationKey);
      const slots = remember(memory, keys);
      return keys.map((key) => DESTINATION_COLORS[slots.get(key) as number]);
    },
  };
}

function remember(memory: Map<string, number>, keys: readonly string[]): Map<string, number> {
  const unique = uniqueKeys(keys);
  const index = new Map(unique.map((key, position) => [key, position]));
  const fixed = unique.map((key) => memory.get(key) ?? -1);
  if (fixed.every((color) => color >= 0)) {
    return memory;
  }
  const assigned = separateNeighbors(fixed, neighborEdges(keys, index), new Set(memory.values()));
  unique.forEach((key, position) => {
    memory.set(key, assigned[position]);
  });
  return memory;
}

function uniqueKeys(keys: readonly string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const key of keys) {
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(key);
  }
  return unique;
}

function neighborEdges(keys: readonly string[], index: ReadonlyMap<string, number>): Array<[number, number]> {
  const edges: Array<[number, number]> = [];
  for (let cursor = 1; cursor < keys.length; cursor += 1) {
    const above = index.get(keys[cursor - 1]);
    const below = index.get(keys[cursor]);
    if (above === undefined || below === undefined || above === below) {
      continue;
    }
    edges.push([above, below]);
  }
  return edges;
}

function destinationKey(destination: string): string {
  return destination.trim().replace(/\s+/g, " ").normalize("NFC").toLocaleLowerCase(FINNISH_LOCALE);
}
