import type { Departure } from "@shared/domain/departure";
import type { Mode } from "@shared/domain/mode";

interface RenderDepartureCardOptions {
  departure: Departure;
  documentRef: Document;
  mode: Mode;
}

interface RelativeDeparture {
  text: string;
  urgency: "now" | "soon" | "calm";
}

interface DepartureCardModel {
  destination: string;
  line: string;
  platformLabel: string | null;
  relativeDeparture: RelativeDeparture;
}

const NOW_THRESHOLD_MINUTES = 2;
const SOON_THRESHOLD_MINUTES = 8;

function getMinutesUntil(departureIso: string): number {
  return Math.max(0, Math.floor((new Date(departureIso).getTime() - Date.now()) / 60_000));
}

function formatRelativeDepartureTime(departureIso: string): RelativeDeparture {
  const differenceInMinutes = getMinutesUntil(departureIso);
  const text = differenceInMinutes === 0 ? "Now" : `${differenceInMinutes}m`;
  const urgency =
    differenceInMinutes <= NOW_THRESHOLD_MINUTES
      ? "now"
      : differenceInMinutes <= SOON_THRESHOLD_MINUTES
        ? "soon"
        : "calm";
  return { text, urgency };
}

function resolvePlatformLabel(departure: Departure, mode: Mode): string | null {
  if (mode === "RAIL" && departure.track) {
    return `Track ${departure.track}`;
  }
  return departure.stopCode || null;
}

function buildDepartureCardModel(departure: Departure, mode: Mode): DepartureCardModel {
  return {
    destination: departure.destination,
    line: departure.line,
    platformLabel: resolvePlatformLabel(departure, mode),
    relativeDeparture: formatRelativeDepartureTime(departure.departureIso),
  };
}

export function renderDepartureCard(options: RenderDepartureCardOptions): HTMLTableRowElement {
  const { departure, documentRef, mode } = options;
  const model = buildDepartureCardModel(departure, mode);
  const item = documentRef.createElement("tr");
  item.className = "departure-card";

  const line = documentRef.createElement("td");
  line.className = "departure-card__line";
  line.textContent = model.line;

  const destination = documentRef.createElement("td");
  destination.className = "departure-card__destination";

  const destinationText = documentRef.createElement("span");
  destinationText.className = "departure-card__destination-text";
  destinationText.textContent = model.destination;
  destination.appendChild(destinationText);

  if (model.platformLabel) {
    const platform = documentRef.createElement("span");
    platform.className = "departure-card__platform";
    platform.textContent = model.platformLabel;
    destination.appendChild(platform);
  }

  const time = documentRef.createElement("td");
  time.className = "departure-card__time";
  time.dataset.urgency = model.relativeDeparture.urgency;
  const timeValue = documentRef.createElement("time");
  timeValue.setAttribute("datetime", departure.departureIso);
  timeValue.textContent = model.relativeDeparture.text;
  time.appendChild(timeValue);

  item.append(line, destination, time);
  return item;
}
