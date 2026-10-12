import { useMemo, useSyncExternalStore } from "react";
import { feedEvents, subscribeFeedEvents, type FeedEvent } from "../feedEvents";

const none: readonly FeedEvent[] = [];

export function useFeedEvents(cameraId: string | null): readonly FeedEvent[] {
  const all = useSyncExternalStore(subscribeFeedEvents, feedEvents);
  return useMemo(() => (cameraId ? all.filter((event) => event.cameraId === cameraId) : none), [all, cameraId]);
}
