import type { Departure } from "../../shared/domain/departure.js";
import {
  departureTimeUpdates,
  serializeDepartureTimeUpdate,
} from "../../shared/domain/departure-live.js";

export function startDepartureLiveSession(input: {
  loadBoard: () => Promise<readonly Departure[]>;
  pollMs: number;
  send: (message: string) => void;
}): { stop: () => void } {
  let stopped = false;
  let pending = false;
  let previous: readonly Departure[] | null = null;

  const tick = async (): Promise<void> => {
    if (stopped || pending) {
      return;
    }
    pending = true;
    try {
      const next = await input.loadBoard();
      if (stopped) {
        return;
      }
      if (previous) {
        for (const update of departureTimeUpdates(previous, next)) {
          input.send(serializeDepartureTimeUpdate(update));
        }
      }
      previous = next;
    } catch {
      return;
    } finally {
      pending = false;
    }
  };

  const timer = setInterval(() => {
    void tick();
  }, input.pollMs);
  timer.unref();
  void tick();

  return {
    stop() {
      stopped = true;
      clearInterval(timer);
    },
  };
}
