import { describe, expect, it } from "vitest";
import { createMemoryHistory, historyStart, pieceAt, type HistoryPiece } from "./history";

function piece(from: number, to: number): HistoryPiece {
  return { from, to, blob: new Blob(["x"]), url: `blob:${from}` };
}

describe("memory history", () => {
  it("keeps pieces oldest first and tells listeners", () => {
    const released: string[] = [];
    const store = createMemoryHistory((url) => released.push(url));
    let calls = 0;
    const off = store.subscribe(() => {
      calls += 1;
    });
    store.add(piece(60, 90));
    store.add(piece(0, 30));
    store.add(piece(30, 60));
    off();
    expect(store.pieces().map((item) => item.from)).toEqual([0, 30, 60]);
    expect(calls).toBe(3);
    expect(released).toEqual([]);
  });

  it("drops pieces that ended before the cutoff and releases their urls", () => {
    const released: string[] = [];
    const store = createMemoryHistory((url) => released.push(url));
    store.add(piece(0, 30));
    store.add(piece(30, 60));
    store.add(piece(60, 90));
    store.prune(45);
    expect(store.pieces().map((item) => item.from)).toEqual([30, 60]);
    expect(released).toEqual(["blob:0"]);
    store.clear();
    expect(store.pieces()).toEqual([]);
    expect(released).toEqual(["blob:0", "blob:30", "blob:60"]);
  });

  it("finds the piece that holds a moment", () => {
    const pieces = [piece(0, 30), piece(30, 60)];
    expect(pieceAt(pieces, 0)?.from).toBe(0);
    expect(pieceAt(pieces, 29)?.from).toBe(0);
    expect(pieceAt(pieces, 30)?.from).toBe(30);
    expect(pieceAt(pieces, 60)).toBeNull();
    expect(historyStart(pieces)).toBe(0);
    expect(historyStart([])).toBeNull();
  });
});
