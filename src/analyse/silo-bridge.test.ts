import { describe, expect, it } from "vitest";
import { createSiloBridge } from "./silo-bridge";
import type { SiloRow, SiloTable } from "./silo-events";
import { createMemoryStore } from "./store";

const T0 = "2026-10-02T06:00:00+00:00";
const T1 = "2026-10-02T06:05:00+00:00";

function row(id: number, over: Partial<SiloRow> = {}): SiloRow {
  return { id, site_id: "spectr-pi", ts: T0, created_at: T0, ...over };
}

type Answer = SiloRow[] | number;

// A fake PostgREST: answers each table from its own queue and records the URLs asked for.
function fakeFetch(answers: Partial<Record<SiloTable, Answer[]>>) {
  const urls: string[] = [];
  const fetch = async (url: string) => {
    urls.push(url);
    const table = url.match(/rest\/v1\/(silo_[a-z_]+)\?/)?.[1] as SiloTable;
    const next = answers[table]?.shift();
    if (typeof next === "number") return { ok: false, status: next, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => next ?? [] };
  };
  return { fetch, urls };
}

function bridge(answers: Partial<Record<SiloTable, Answer[]>>, store = createMemoryStore({ storage: null }), extra = {}) {
  const net = fakeFetch(answers);
  const timers: Array<() => void> = [];
  const b = createSiloBridge({
    url: "https://example.supabase.co/",
    key: "publishable-key",
    store,
    sites: ["spectr-pi"],
    containerForSite: (site) => (site === "spectr-pi" ? "fetsund-c1" : null),
    tables: ["silo_empty", "silo_full", "silo_heartbeat"],
    fetch: net.fetch,
    now: () => Date.parse("2026-10-02T07:00:00Z"),
    setTimer: (fn) => {
      timers.push(fn);
      return timers.length;
    },
    clearTimer: () => {
      timers.length = 0;
    },
    ...extra,
  });
  return { b, store, net, timers };
}

const asked = (urls: string[]) => urls.map((url) => url.replace("https://example.supabase.co/rest/v1/", "").replace("?select=*&site_id=in.(spectr-pi)&", " "));

describe("silo bridge", () => {
  it("asks every table for rows after the last one seen, with the key in both headers", async () => {
    const { b, net } = bridge({});
    await b.poll();
    expect(asked(net.urls)).toEqual([
      "silo_empty id=gt.0&order=id.asc&limit=1000",
      "silo_full id=gt.0&order=id.asc&limit=1000",
      "silo_heartbeat id=gt.0&order=id.asc&limit=1000",
    ]);
    expect(b.status().error).toBeNull();
    expect(b.status().lastPollAt).toBe(Date.parse("2026-10-02T07:00:00Z"));
  });

  it("mirrors rows from all tables in time order and remembers where it got to in each", async () => {
    const { b, store } = bridge({ silo_empty: [[row(1)]], silo_full: [[row(3, { ts: T1 })]], silo_heartbeat: [[row(7, { ts: T1, empty: false })]] });
    const count = await b.poll();
    expect(count).toBe(3);
    expect(store.alerts()).toHaveLength(1);
    expect(store.alerts()[0].clearedAt).toBe(T1);
    expect(store.events().map((event) => event.type)).toEqual(["empty", "alert_raised", "heartbeat", "filled", "alert_cleared"]);
    expect(b.status().lastRowIds).toEqual({ silo_empty: 1, silo_full: 3, silo_heartbeat: 7 });
    expect(b.status().rowsMirrored).toBe(3);
    expect(b.status().lastRowAt).toBe(T1);

    await b.poll();
    expect(b.status().lastRowIds).toEqual({ silo_empty: 1, silo_full: 3, silo_heartbeat: 7 });
  });

  it("resumes per table from the store after a restart, so nothing is mirrored twice", async () => {
    const first = bridge({ silo_heartbeat: [[row(41, { empty: false })]] });
    await first.b.poll();

    const second = bridge({}, first.store);
    await second.b.poll();
    expect(asked(second.net.urls)).toContain("silo_heartbeat id=gt.41&order=id.asc&limit=1000");
    expect(asked(second.net.urls)).toContain("silo_empty id=gt.0&order=id.asc&limit=1000");
    expect(second.store.events()).toHaveLength(1);
  });

  it("keeps paging a table while a page is full", async () => {
    const { b, net, store } = bridge({ silo_heartbeat: [[row(1), row(2)], [row(3)]] }, undefined, { pageSize: 2 });
    await b.poll();
    expect(asked(net.urls)).toContain("silo_heartbeat id=gt.2&order=id.asc&limit=2");
    expect(store.events()).toHaveLength(3);
  });

  it("mirrors nothing when one table fails, reports it, and recovers on the next poll", async () => {
    const { b, store } = bridge({ silo_empty: [[row(1)], [row(1)]], silo_heartbeat: [500, []] });
    await b.poll();
    expect(b.status().error).toBe("silo_heartbeat: HTTP 500");
    expect(store.events()).toHaveLength(0);

    await b.poll();
    expect(b.status().error).toBeNull();
    expect(store.alerts()).toHaveLength(1);
  });

  it("polls once on start, then on a timer until stopped", async () => {
    const { b, timers, net } = bridge({});
    await b.start();
    expect(b.status().running).toBe(true);
    expect(net.urls).toHaveLength(3);
    expect(timers).toHaveLength(1);

    timers[0]();
    // Let the poll finish and schedule the next one.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(net.urls).toHaveLength(6);
    expect(timers).toHaveLength(2);

    b.stop();
    expect(b.status().running).toBe(false);
    expect(timers).toHaveLength(0);
  });

  it("resync wipes the store and starts again from the first row of every table", async () => {
    const { b, store, net } = bridge({ silo_heartbeat: [[row(5, { empty: false })], [row(5, { empty: false }), row(6, { ts: T1, empty: false })]] });
    await b.start();
    expect(store.events()).toHaveLength(1);
    expect(b.status().lastRowIds).toEqual({ silo_heartbeat: 5 });

    await b.resync();
    expect(asked(net.urls).filter((url) => url.startsWith("silo_heartbeat"))[1]).toContain("id=gt.0");
    expect(store.events().map((event) => event.type)).toEqual(["heartbeat", "heartbeat"]);
    expect(b.status().lastRowIds).toEqual({ silo_heartbeat: 6 });
    expect(b.status().running).toBe(true);
    b.stop();
  });

  it("tells listeners when the status changes", async () => {
    const { b } = bridge({});
    let calls = 0;
    const off = b.subscribe(() => {
      calls += 1;
    });
    await b.poll();
    expect(calls).toBeGreaterThan(0);
    off();
  });
});
