const FINNISH_LOCALE = "fi-FI";

// Ordered so the first destinations a rider sees stay farthest apart under protanopia.
const DESTINATION_COLORS = [
  "#ffff22",
  "#a283ff",
  "#cb9484",
  "#b5ffe4",
  "#d4d6ff",
  "#7ca51b",
  "#feffb5",
  "#adcac7",
  "#a4959c",
  "#e5c7ac",
  "#a5ca00",
  "#dd9f6a",
  "#b3a8c2",
  "#f7e678",
  "#65c1ff",
  "#c684cf",
] as const;

export interface DestinationColorBook {
  colorFor(destination: string): string;
}

function destinationKey(destination: string): string {
  return destination.trim().replace(/\s+/g, " ").normalize("NFC").toLocaleLowerCase(FINNISH_LOCALE);
}

function colorForSlot(slot: number): string {
  return DESTINATION_COLORS[slot % DESTINATION_COLORS.length];
}

export function createDestinationColorBook(): DestinationColorBook {
  const slots = new Map<string, number>();
  return {
    colorFor(destination) {
      const key = destinationKey(destination);
      const existing = slots.get(key);
      if (existing !== undefined) {
        return colorForSlot(existing);
      }
      const slot = slots.size;
      slots.set(key, slot);
      return colorForSlot(slot);
    },
  };
}
