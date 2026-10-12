import { describe, expect, it } from "vitest";
import { createAccountStores, createLocalSubscriptionStore, createLocalUsageStore } from "./stores";
import type { Subscription, UsageEvent } from "./types";

function fakeStorage(): Storage {
  const items = new Map<string, string>();
  return {
    get length() {
      return items.size;
    },
    key: (index: number) => [...items.keys()][index] ?? null,
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => {
      items.set(key, value);
    },
    removeItem: (key: string) => {
      items.delete(key);
    },
    clear: () => {
      items.clear();
    },
  };
}

function usage(at: Date, patch: Partial<UsageEvent> = {}): UsageEvent {
  return { id: `event-${at.getTime()}`, at: at.toISOString(), feature: "labeling", model: "Argus 1.0", tokensIn: 1000, tokensOut: 200, cost: 0.032, ...patch };
}

const subscription: Subscription = {
  planId: "pro",
  startedAt: new Date(2026, 8, 15, 9).toISOString(),
  renewsAt: new Date(2026, 9, 15, 9).toISOString(),
  status: "active",
};

describe("local usage store", () => {
  it("lists what was added, oldest first", async () => {
    const storage = fakeStorage();
    const store = createLocalUsageStore(storage);
    const older = usage(new Date(2026, 9, 1, 8));
    const newer = usage(new Date(2026, 9, 2, 8));
    await store.add(newer);
    await store.add(older);
    expect(await store.list()).toEqual([older, newer]);
    expect(storage.getItem("visionlab.usage")).toBe(JSON.stringify([newer, older]));
  });

  it("replaces the whole list", async () => {
    const store = createLocalUsageStore(fakeStorage());
    await store.add(usage(new Date(2026, 9, 1, 8)));
    const only = usage(new Date(2026, 9, 3, 8));
    await store.replace([only]);
    expect(await store.list()).toEqual([only]);
  });

  it("drops entries that do not look like usage events", async () => {
    const storage = fakeStorage();
    const good = usage(new Date(2026, 9, 1, 8));
    storage.setItem(
      "visionlab.usage",
      JSON.stringify([
        good,
        { ...good, id: 2 },
        { ...good, at: "yesterday" },
        { ...good, feature: "billing" },
        { ...good, model: null },
        { ...good, tokensIn: -5 },
        { ...good, tokensOut: "many" },
        { ...good, cost: Number.NaN },
        "not an event",
        null,
      ]),
    );
    expect(await createLocalUsageStore(storage).list()).toEqual([good]);
  });

  it("treats unreadable storage as empty", async () => {
    const garbled = fakeStorage();
    garbled.setItem("visionlab.usage", "{not json");
    expect(await createLocalUsageStore(garbled).list()).toEqual([]);

    const wrongShape = fakeStorage();
    wrongShape.setItem("visionlab.usage", JSON.stringify({ events: [] }));
    expect(await createLocalUsageStore(wrongShape).list()).toEqual([]);

    const locked: Storage = {
      ...fakeStorage(),
      getItem: () => {
        throw new Error("denied");
      },
    };
    expect(await createLocalUsageStore(locked).list()).toEqual([]);
  });
});

describe("local subscription store", () => {
  it("round trips a subscription", async () => {
    const storage = fakeStorage();
    const store = createLocalSubscriptionStore(storage);
    expect(await store.load()).toBeNull();
    await store.save(subscription);
    expect(await store.load()).toEqual(subscription);
    expect(storage.getItem("visionlab.subscription")).toBe(JSON.stringify(subscription));
  });

  it("returns null for a record it does not trust", async () => {
    const bad = [
      { ...subscription, planId: "enterprise" },
      { ...subscription, status: "paused" },
      { ...subscription, startedAt: 0 },
      { ...subscription, renewsAt: "soon" },
      [subscription],
      "pro",
    ];
    for (const record of bad) {
      const storage = fakeStorage();
      storage.setItem("visionlab.subscription", JSON.stringify(record));
      expect(await createLocalSubscriptionStore(storage).load()).toBeNull();
    }
  });
});

describe("createAccountStores", () => {
  it("keeps local data in the storage it is given", async () => {
    const storage = fakeStorage();
    const stores = createAccountStores("local", storage);
    await stores.subscription.save(subscription);
    await stores.usage.add(usage(new Date(2026, 9, 1, 8)));
    expect(storage.length).toBe(2);
    expect(await stores.subscription.load()).toEqual(subscription);
    expect(await stores.usage.list()).toHaveLength(1);
  });

  it("has no supabase backend yet", () => {
    expect(() => createAccountStores("supabase")).toThrow("Supabase account stores are not wired yet");
  });
});
