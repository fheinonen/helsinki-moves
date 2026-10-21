const FINNISH_LOCALE = "fi-FI";

const DESTINATION_COLORS = [
  "#e69494",
  "#94e6ac",
  "#c494e6",
  "#e6dc94",
  "#94d8e6",
  "#e694c0",
  "#a8e694",
  "#9794e6",
  "#e6af94",
  "#94e6c7",
  "#df94e6",
  "#d5e694",
  "#94bde6",
  "#e694a5",
  "#94e69b",
  "#b394e6",
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
