import { useEffect, useSyncExternalStore } from "react";
import { createMemoryHistory, recordStream, type HistoryPiece, type HistoryStore } from "../history";
import { useNow } from "./useSilo";

// One store per feed for the life of the app, so leaving the page and coming back keeps what was recorded.
const stores = new Map<string, HistoryStore>();
const none: readonly HistoryPiece[] = [];

function storeFor(feedId: string): HistoryStore {
  let store = stores.get(feedId);
  if (!store) {
    store = createMemoryHistory();
    stores.set(feedId, store);
  }
  return store;
}

export function useFeedHistory(feedId: string | null, stream: MediaStream | null) {
  const store = feedId ? storeFor(feedId) : null;

  useEffect(() => {
    if (!store || !stream) return;
    return recordStream(stream, store);
  }, [store, stream]);

  const pieces = useSyncExternalStore(store ? store.subscribe : noSubscribe, store ? store.pieces : noPieces);
  const now = useNow(1000);
  return { pieces, now };
}

function noSubscribe() {
  return () => {};
}

function noPieces() {
  return none;
}
