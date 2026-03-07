export interface Store<State> {
  getState(): State;
  setState(updater: State | ((state: State) => State)): void;
  subscribe(listener: (state: State) => void): () => void;
}

export function createStore<State>(initialState: State): Store<State> {
  let state = initialState;
  const listeners = new Set<(state: State) => void>();

  function getState(): State {
    return state;
  }

  function setState(updater: State | ((currentState: State) => State)): void {
    state = typeof updater === "function" ? (updater as (currentState: State) => State)(state) : updater;
    for (const listener of listeners) {
      listener(state);
    }
  }

  function subscribe(listener: (nextState: State) => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  return {
    getState,
    setState,
    subscribe,
  };
}
