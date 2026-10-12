import { accountConfig } from "./config";
import type { AccountBackend } from "./config";
import { PLANS } from "./plans";
import { USAGE_FEATURES } from "./types";
import type { Subscription, SubscriptionStatus, UsageEvent, UsageFeature } from "./types";

export interface UsageStore {
  list(): Promise<UsageEvent[]>;
  add(event: UsageEvent): Promise<void>;
  replace(events: UsageEvent[]): Promise<void>;
}

export interface SubscriptionStore {
  load(): Promise<Subscription | null>;
  save(subscription: Subscription): Promise<void>;
}

export type AccountStores = { usage: UsageStore; subscription: SubscriptionStore };

const usageKey = "visionlab.usage";
const subscriptionKey = "visionlab.subscription";
const statuses: readonly SubscriptionStatus[] = ["trial", "active", "past_due", "canceled"];

function readJson(storage: Storage, key: string): unknown {
  try {
    const raw = storage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function isDate(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function isAmount(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isFeature(value: unknown): value is UsageFeature {
  return USAGE_FEATURES.some((feature) => feature === value);
}

function isUsageEvent(value: unknown): value is UsageEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as Partial<UsageEvent>;
  return typeof event.id === "string" && isDate(event.at) && isFeature(event.feature) && typeof event.model === "string" && isAmount(event.tokensIn) && isAmount(event.tokensOut) && isAmount(event.cost);
}

function isSubscription(value: unknown): value is Subscription {
  if (!value || typeof value !== "object") return false;
  const subscription = value as Partial<Subscription>;
  return PLANS.some((plan) => plan.id === subscription.planId) && statuses.some((status) => status === subscription.status) && isDate(subscription.startedAt) && isDate(subscription.renewsAt);
}

function loadUsage(storage: Storage): UsageEvent[] {
  const parsed = readJson(storage, usageKey);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(isUsageEvent).sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}

export function createLocalUsageStore(storage: Storage = localStorage): UsageStore {
  return {
    async list() {
      return loadUsage(storage);
    },
    async add(event) {
      storage.setItem(usageKey, JSON.stringify([...loadUsage(storage), event]));
    },
    async replace(events) {
      storage.setItem(usageKey, JSON.stringify(events));
    },
  };
}

export function createLocalSubscriptionStore(storage: Storage = localStorage): SubscriptionStore {
  return {
    async load() {
      const parsed = readJson(storage, subscriptionKey);
      return isSubscription(parsed) ? parsed : null;
    },
    async save(subscription) {
      storage.setItem(subscriptionKey, JSON.stringify(subscription));
    },
  };
}

export function createAccountStores(backend: AccountBackend = accountConfig.backend, storage?: Storage): AccountStores {
  if (backend === "supabase") throw new Error("Supabase account stores are not wired yet");
  return { usage: createLocalUsageStore(storage), subscription: createLocalSubscriptionStore(storage) };
}
