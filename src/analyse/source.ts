import { DEVICES, containerForSite } from "./containers";
import { createSiloBridge, type BridgeStatus, type SiloBridge } from "./silo-bridge";
import { createMemoryStore, type DataStore } from "./store";

const SUPABASE_URL = ((import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? "").trim();
const SUPABASE_KEY = ((import.meta.env.VITE_SUPABASE_KEY as string | undefined) ?? "").trim();

// The Pi through Supabase when .env names a project. Tests never reach the network, whatever .env says.
export const DATA_SOURCE: "supabase" | "none" = SUPABASE_URL && SUPABASE_KEY && import.meta.env.MODE !== "test" ? "supabase" : "none";

// Bumped when the mirror rules change. A local copy made under older rules is wiped and fetched again.
const MIRROR_VERSION = "1";
const STORE_KEY = "visionlab.silo";
const VERSION_KEY = "visionlab.silo-version";

let store: DataStore | null = null;
let bridge: SiloBridge | null = null;
const listeners = new Set<() => void>();

export function getSiloStore(): DataStore {
  if (!store) store = createMemoryStore({ persistKey: STORE_KEY });
  return store;
}

// Polling runs only while the Analyse tab is open. Call from an effect; the returned function stops it.
export function startSiloBridge(): () => void {
  const current = siloBridge();
  if (!current) return () => {};
  void current.start();
  return () => current.stop();
}

// The bridge may not exist yet when a component first renders, so its status is read through here.
export function subscribeBridgeStatus(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function bridgeStatus(): BridgeStatus | null {
  return bridge ? bridge.status() : null;
}

function siloBridge(): SiloBridge | null {
  if (DATA_SOURCE !== "supabase") return null;
  if (!bridge) {
    if (!mirrorIsCurrent()) {
      getSiloStore().clear();
      markMirrorCurrent();
    }
    bridge = createSiloBridge({
      url: SUPABASE_URL,
      key: SUPABASE_KEY,
      store: getSiloStore(),
      sites: DEVICES.map((device) => device.siteId),
      containerForSite,
    });
    bridge.subscribe(notify);
    notify();
  }
  return bridge;
}

function notify() {
  for (const listener of listeners) listener();
}

function mirrorIsCurrent(): boolean {
  try {
    return localStorage.getItem(VERSION_KEY) === MIRROR_VERSION;
  } catch {
    return true;
  }
}

function markMirrorCurrent(): void {
  try {
    localStorage.setItem(VERSION_KEY, MIRROR_VERSION);
  } catch {
    // No storage: nothing to remember.
  }
}
