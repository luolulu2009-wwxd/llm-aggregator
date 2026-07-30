/**
 * Circuit Breaker — protects against cascading failures.
 *
 * After 3 consecutive failures, the breaker opens for 30s,
 * skipping the provider and falling back to alternatives.
 */
const states = new Map<string, { failures: number; openUntil: number; lastCheck: number }>();

const THRESHOLD = 3;        // consecutive failures before opening
const COOLDOWN_MS = 30_000; // how long the breaker stays open
const HALF_OPEN_MS = 5_000; // after cooldown, allow 1 probe request

export interface CircuitState {
  /** Whether the breaker is currently open (should skip this provider) */
  open: boolean;
  /** Record a successful call — resets the breaker */
  recordSuccess(): void;
  /** Record a failed call — increments failure counter */
  recordFailure(): void;
  /** Get diagnostic info */
  getStatus(): { failures: number; open: boolean; openUntil: number };
}

export function getCircuit(provider: string): CircuitState {
  if (!states.has(provider)) {
    states.set(provider, { failures: 0, openUntil: 0, lastCheck: 0 });
  }

  const state = states.get(provider)!;

  return {
    get open() {
      // Half-open: allow one probe after cooldown
      if (state.openUntil > 0 && Date.now() > state.openUntil) {
        state.openUntil = 0; // try again, let one request through
        return false;
      }
      if (state.failures >= THRESHOLD) {
        if (state.openUntil === 0) {
          state.openUntil = Date.now() + COOLDOWN_MS;
        }
        return true;
      }
      return false;
    },

    recordSuccess() {
      state.failures = 0;
      state.openUntil = 0;
    },

    recordFailure() {
      state.failures++;
      if (state.failures >= THRESHOLD && state.openUntil === 0) {
        state.openUntil = Date.now() + COOLDOWN_MS;
      }
    },

    getStatus() {
      return {
        failures: state.failures,
        open: this.open,
        openUntil: state.openUntil,
      };
    },
  };
}

/** Get all circuit states for health check */
export function getAllCircuits(): Record<string, { failures: number; open: boolean }> {
  const result: Record<string, { failures: number; open: boolean }> = {};
  for (const [provider] of states) {
    const c = getCircuit(provider);
    result[provider] = { failures: c.getStatus().failures, open: c.open };
  }
  return result;
}
