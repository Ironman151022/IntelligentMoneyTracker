/**
 * Minimal module-level event bus for cross-component notifications.
 * Avoids prop-drilling for fire-and-forget events like "transaction logged".
 */

type Listener = () => void;

function createBus() {
  const listeners = new Set<Listener>();
  return {
    on(fn: Listener): () => void {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    emit() {
      listeners.forEach((fn) => fn());
    },
  };
}

export const transactionLoggedBus = createBus();
