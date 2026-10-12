import { accountConfig } from "./config";
import { seedAccount } from "./seed";
import { createAccountStores } from "./stores";
import type { AccountStores } from "./stores";
import type { Subscription, UsageEvent } from "./types";

export type AccountData = { subscription: Subscription | null; events: UsageEvent[] };

let instance: AccountStores | null = null;
let loading: Promise<AccountData> | null = null;
let loaded: AccountData | null = null;

export function getAccountStores(): AccountStores {
  if (!instance) instance = createAccountStores();
  return instance;
}

// The sidebar badge and the Account page share one load.
export function loadAccount(now: number): Promise<AccountData> {
  if (!loading) {
    loading = load(now).then(
      (account) => {
        loaded = account;
        return account;
      },
      (error: unknown) => {
        // A failed load is not kept, so the next visit tries again.
        loading = null;
        throw error;
      },
    );
  }
  return loading;
}

// What the last load returned, so a page that comes back renders without a loading state.
export function peekAccount(): AccountData | null {
  return loaded;
}

async function load(now: number): Promise<AccountData> {
  const stores = getAccountStores();
  if (accountConfig.seedDemo) await seedAccount(stores, now);
  const [subscription, events] = await Promise.all([stores.subscription.load(), stores.usage.list()]);
  return { subscription, events };
}
