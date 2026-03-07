import type { Departure } from "@shared/domain/departure";

interface RenderDepartureCardOptions {
  departure: Departure;
  documentRef: Document;
}

function formatRelativeDepartureTime(departureIso: string): string {
  const departureDate = new Date(departureIso);
  const differenceInMinutes = Math.max(
    0,
    Math.floor((departureDate.getTime() - Date.now()) / 60_000)
  );
  return differenceInMinutes === 0 ? "Now" : `${differenceInMinutes}m`;
}

export function renderDepartureCard(options: RenderDepartureCardOptions): HTMLLIElement {
  const { departure, documentRef } = options;
  const item = documentRef.createElement("li");
  item.className = "departure-card";

  const line = documentRef.createElement("strong");
  line.className = "departure-card__line";
  line.textContent = departure.line;

  const destination = documentRef.createElement("span");
  destination.className = "departure-card__destination";
  destination.textContent = departure.destination;

  const time = documentRef.createElement("span");
  time.className = "departure-card__time";
  time.textContent = formatRelativeDepartureTime(departure.departureIso);

  item.append(line, destination, time);
  return item;
}
