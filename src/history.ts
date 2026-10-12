export type HistoryPiece = {
  from: number;
  to: number;
  blob: Blob;
  url: string;
};

// What a feed recorded, oldest first. In memory for now; a store on disk fits behind the
// same interface when the window grows from minutes to days.
export interface HistoryStore {
  pieces(): readonly HistoryPiece[];
  add(piece: HistoryPiece): void;
  prune(before: number): void;
  clear(): void;
  subscribe(listener: () => void): () => void;
}

export const HISTORY_KEEP_MS = 5 * 60_000;
export const HISTORY_PIECE_MS = 10_000;

export function createMemoryHistory(release: (url: string) => void = (url) => URL.revokeObjectURL(url)): HistoryStore {
  let list: readonly HistoryPiece[] = [];
  const listeners = new Set<() => void>();

  function commit(next: readonly HistoryPiece[]) {
    list = next;
    for (const listener of listeners) listener();
  }

  return {
    pieces: () => list,
    add(piece) {
      commit([...list, piece].sort((a, b) => a.from - b.from));
    },
    prune(before) {
      const gone = list.filter((piece) => piece.to < before);
      if (gone.length === 0) return;
      gone.forEach((piece) => release(piece.url));
      commit(list.filter((piece) => piece.to >= before));
    },
    clear() {
      list.forEach((piece) => release(piece.url));
      commit([]);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export function pieceAt(pieces: readonly HistoryPiece[], time: number): HistoryPiece | null {
  return pieces.find((piece) => time >= piece.from && time < piece.to) ?? null;
}

export function historyStart(pieces: readonly HistoryPiece[]): number | null {
  return pieces.length > 0 ? pieces[0].from : null;
}

// Records the stream in short pieces. Each piece is a complete recording of its own, so it
// plays by itself and the oldest can be dropped without breaking the rest.
export function recordStream(
  stream: MediaStream,
  store: HistoryStore,
  options: { pieceMs?: number; keepMs?: number; now?: () => number } = {},
): () => void {
  const pieceMs = options.pieceMs ?? HISTORY_PIECE_MS;
  const keepMs = options.keepMs ?? HISTORY_KEEP_MS;
  const now = options.now ?? (() => Date.now());
  const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp8") ? "video/webm;codecs=vp8" : "video/webm";
  let recorder: MediaRecorder | null = null;
  let timer = 0;
  let stopped = false;

  const begin = () => {
    if (stopped) return;
    const from = now();
    recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 1_000_000 });
    recorder.ondataavailable = (event) => {
      if (event.data.size === 0) return;
      const to = now();
      store.add({ from, to, blob: event.data, url: URL.createObjectURL(event.data) });
      store.prune(to - keepMs);
    };
    recorder.onstop = () => begin();
    recorder.start();
    timer = window.setTimeout(() => {
      if (recorder && recorder.state === "recording") recorder.stop();
    }, pieceMs);
  };

  begin();
  return () => {
    stopped = true;
    window.clearTimeout(timer);
    if (recorder && recorder.state !== "inactive") recorder.stop();
  };
}
