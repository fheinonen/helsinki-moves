import { createStore, type Store } from "@client/lib/store/create-store";
import { type Mode } from "@shared/domain/mode";

export interface ModeState {
  activeMode: Mode;
}

export interface ModeStore extends Store<ModeState> {
  getActiveMode(): Mode;
  setMode(mode: Mode): void;
  subscribeMode(listener: (mode: Mode) => void): () => void;
}

export function createModeStore(initialMode: Mode = "RAIL"): ModeStore {
  const store = createStore<ModeState>({ activeMode: initialMode });

  return {
    ...store,
    getActiveMode() {
      return store.getState().activeMode;
    },
    setMode(mode: Mode) {
      store.setState({ activeMode: mode });
    },
    subscribeMode(listener) {
      return store.subscribe((state) => {
        listener(state.activeMode);
      });
    },
  };
}
