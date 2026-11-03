import type { VehicleSpanEvent } from "@shared/domain/vehicle-span";

interface SpanSource {
  addEventListener(type: string, listener: (event: { data?: string }) => void): void;
  close(): void;
}

export function vehicleSpanUrl(tripId: string, stopId: string): string {
  const params = new URLSearchParams({ stopId, tripId });
  return `/api/v1/vehicle-span?${params.toString()}`;
}

export function openVehicleSpanStream(input: {
  eventSourceFactory?: (url: string) => SpanSource;
  onEvent: (event: VehicleSpanEvent) => void;
  stopId: string;
  tripId: string;
}): () => void {
  const source = (input.eventSourceFactory ?? ((url) => new EventSource(url)))(
    vehicleSpanUrl(input.tripId, input.stopId)
  );
  const publish = (event: { data?: string }) => {
    if (!event.data) {
      return;
    }
    input.onEvent(JSON.parse(event.data) as VehicleSpanEvent);
  };
  source.addEventListener("span", publish);
  source.addEventListener("position", publish);
  source.addEventListener("place", publish);
  return () => {
    source.close();
  };
}
