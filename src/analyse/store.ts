import { applyRetention } from "./retention";
import type { Alert, LoggedEvent } from "./types";

// The store assigns id and receivedAt unless the caller brings them, as the Supabase mirror does.
export type AppendEventInput = Omit<LoggedEvent, "id" | "receivedAt"> & { id?: string; receivedAt?: string };

export type DataStore = {
  events(): readonly LoggedEvent[];
  alerts(): readonly Alert[];
  appendEvent(input: AppendEventInput): LoggedEvent;
  saveAlert(alert: Alert): void;
  clear(): void;
  subscribe(listener: () => void): () => void;
};

export function newId(): string {
  const webCrypto = globalThis.crypto;
  if (webCrypto && typeof webCrypto.randomUUID === "function") return webCrypto.randomUUID();
  // No randomUUID in an insecure browser context: time plus a random tail is unique enough for a mirror.
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function safeLocalStorage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

export type MemoryStoreOptions = {
  // Key in web storage. Omit for a purely in-memory store.
  persistKey?: string;
  // Where to persist; defaults to localStorage when available. Pass null to disable.
  storage?: Storage | null;
  now?: () => number;
};

export function createMemoryStore(options: MemoryStoreOptions = {}): DataStore {
  const now = options.now ?? (() => Date.now());
  const storage = options.storage === undefined ? safeLocalStorage() : options.storage;
  const key = options.persistKey ?? null;
  let events: readonly LoggedEvent[] = [];
  let alerts: readonly Alert[] = [];
  const listeners = new Set<() => void>();
  let pending: ReturnType<typeof setTimeout> | null = null;

  if (storage && key) {
    try {
      const raw = storage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw) as { events?: unknown; alerts?: unknown };
        events = applyRetention(Array.isArray(parsed.events) ? (parsed.events as LoggedEvent[]) : [], now());
        alerts = Array.isArray(parsed.alerts) ? (parsed.alerts as Alert[]) : [];
      }
    } catch {
      // Unreadable storage counts as empty.
    }
  }

  // A poll appends many rows at once; write them in one go.
  function persist() {
    if (!storage || !key) return;
    if (pending) clearTimeout(pending);
    pending = setTimeout(() => {
      pending = null;
      try {
        storage.setItem(key, JSON.stringify({ events, alerts }));
      } catch {
        // Quota or private mode: keep running in memory.
      }
    }, 300);
  }

  function emit() {
    persist();
    for (const listener of listeners) listener();
  }

  return {
    events: () => events,
    alerts: () => alerts,
    appendEvent(input) {
      const event: LoggedEvent = {
        ...input,
        id: input.id ?? newId(),
        receivedAt: input.receivedAt ?? new Date(now()).toISOString(),
      };
      events = [...events, event];
      emit();
      return event;
    },
    saveAlert(alert) {
      alerts = alerts.some((item) => item.id === alert.id) ? alerts.map((item) => (item.id === alert.id ? alert : item)) : [...alerts, alert];
      emit();
    },
    clear() {
      events = [];
      alerts = [];
      emit();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
