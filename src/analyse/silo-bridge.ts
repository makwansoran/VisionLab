import { SILO_TABLES, lastRowIdsIn, mirrorSiloFacts, type SiloFact, type SiloRow, type SiloTable } from "./silo-events";
import type { DataStore } from "./store";
import type { Alert, AlertKind, ContainerId } from "./types";

// The part of fetch the bridge needs, so tests can hand in a fake.
type FetchLike = (url: string, init: { headers: Record<string, string> }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export type SiloBridgeOptions = {
  url: string;
  // The project's publishable key, the same one the Pi uses.
  key: string;
  store: DataStore;
  // The site_id values to read. The Pi writes "spectr-pi".
  sites: readonly string[];
  containerForSite: (siteId: string) => ContainerId | null;
  // Which of the Pi's tables to read. All of them unless a test says otherwise.
  tables?: readonly SiloTable[];
  intervalMs?: number;
  pageSize?: number;
  fetch?: FetchLike;
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
};

export type BridgeStatus = {
  running: boolean;
  polling: boolean;
  lastPollAt: number | null;
  // ts of the newest row mirrored.
  lastRowAt: string | null;
  // The highest row id mirrored, per table.
  lastRowIds: Partial<Record<SiloTable, number>>;
  rowsMirrored: number;
  error: string | null;
};

export type SiloBridge = {
  start(): Promise<void>;
  stop(): void;
  // One fetch and mirror pass. Returns how many rows arrived.
  poll(): Promise<number>;
  // Wipes the local mirror and fetches everything again from the first row. For when the mirror rules change.
  resync(): Promise<void>;
  status(): BridgeStatus;
  subscribe(listener: () => void): () => void;
};

// Polls PostgREST rather than Realtime: the Pi writes a row every few minutes, a few seconds of delay
// is fine, and it needs no library. Every table is asked for rows after the last one seen in it, all
// at once, and the batch is folded in time order.
export function createSiloBridge(options: SiloBridgeOptions): SiloBridge {
  const fetchFn: FetchLike = options.fetch ?? ((url, init) => fetch(url, init));
  const now = options.now ?? (() => Date.now());
  const setTimer = options.setTimer ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
  const clearTimer = options.clearTimer ?? ((handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>));
  const tables = options.tables ?? SILO_TABLES;
  const intervalMs = options.intervalMs ?? 5_000;
  const pageSize = options.pageSize ?? 1000;
  const base = options.url.replace(/\/+$/, "");
  const listeners = new Set<() => void>();
  let timer: unknown = null;
  let status: BridgeStatus = {
    running: false,
    polling: false,
    lastPollAt: null,
    lastRowAt: null,
    lastRowIds: lastRowIdsIn(options.store.events(), options.sites),
    rowsMirrored: 0,
    error: null,
  };

  function set(patch: Partial<BridgeStatus>) {
    status = { ...status, ...patch };
    for (const listener of listeners) listener();
  }

  function activeAlert(containerId: ContainerId, kind: AlertKind): Alert | null {
    return options.store.alerts().find((alert) => alert.containerId === containerId && alert.kind === kind && !alert.clearedAt) ?? null;
  }

  async function fetchPage(table: SiloTable, afterId: number): Promise<SiloRow[]> {
    const sites = options.sites.join(",");
    const url = `${base}/rest/v1/${table}?select=*&site_id=in.(${sites})&id=gt.${afterId}&order=id.asc&limit=${pageSize}`;
    const response = await fetchFn(url, {
      headers: { apikey: options.key, Authorization: `Bearer ${options.key}`, Accept: "application/json" },
    });
    if (!response.ok) throw new Error(`${table}: HTTP ${response.status}`);
    const body = await response.json();
    if (!Array.isArray(body)) throw new Error(`unexpected response from ${table}`);
    return body as SiloRow[];
  }

  // Everything new in one table, page by page.
  async function fetchNew(table: SiloTable): Promise<SiloFact[]> {
    const facts: SiloFact[] = [];
    let after = status.lastRowIds[table] ?? 0;
    for (;;) {
      const rows = await fetchPage(table, after);
      for (const row of rows) facts.push({ table, row });
      if (rows.length < pageSize) break;
      after = rows[rows.length - 1].id;
    }
    return facts;
  }

  async function poll(): Promise<number> {
    if (status.polling) return 0;
    set({ polling: true });
    let count = 0;
    try {
      // All tables or nothing, so one failed request never mirrors half a batch.
      const batches = await Promise.all(tables.map(fetchNew));
      const facts = batches.flat();
      if (facts.length > 0) {
        const mirrored = mirrorSiloFacts(facts, { containerForSite: options.containerForSite, activeAlert, now });
        // Alarms first, so an event that points at one never renders before it exists.
        for (const alert of mirrored.alerts) options.store.saveAlert(alert);
        for (const event of mirrored.events) options.store.appendEvent(event);
        count = facts.length;
        set({
          lastRowIds: { ...status.lastRowIds, ...mirrored.lastRowIds },
          lastRowAt: newestTs(facts),
          rowsMirrored: status.rowsMirrored + facts.length,
        });
      }
      set({ polling: false, lastPollAt: now(), error: null });
    } catch (error) {
      set({ polling: false, lastPollAt: now(), error: error instanceof Error ? error.message : String(error) });
    }
    return count;
  }

  function schedule() {
    timer = setTimer(() => {
      timer = null;
      void poll().finally(() => {
        if (status.running) schedule();
      });
    }, intervalMs);
  }

  function start() {
    if (status.running) return Promise.resolve();
    set({ running: true });
    return poll().then(() => {
      if (status.running) schedule();
    });
  }

  function stop() {
    if (timer !== null) clearTimer(timer);
    timer = null;
    set({ running: false });
  }

  return {
    start,
    stop,
    async resync() {
      stop();
      options.store.clear();
      set({ lastRowIds: {}, lastRowAt: null, rowsMirrored: 0, error: null });
      await start();
    },
    poll,
    status: () => status,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

function newestTs(facts: readonly SiloFact[]): string {
  let newest = facts[0].row.ts;
  for (const { row } of facts) if (Date.parse(row.ts) > Date.parse(newest)) newest = row.ts;
  return newest;
}
