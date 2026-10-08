import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from "react";

export interface OutputLine {
  id: string;
  text: string;
}

const MIN_HEIGHT = 96;

export function Terminal({
  lines,
  height,
  onHeight,
}: {
  lines: OutputLine[];
  height: number;
  onHeight: (height: number) => void;
}) {
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const body = bodyRef.current;
    if (body) body.scrollTop = body.scrollHeight;
  }, [lines]);

  const onResizeStart = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    const startY = event.clientY;
    const startHeight = height;
    const maxHeight = Math.round(window.innerHeight * 0.7);

    const onMove = (move: PointerEvent) => {
      const next = startHeight + (startY - move.clientY);
      onHeight(Math.min(maxHeight, Math.max(MIN_HEIGHT, next)));
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  return (
    <section className="terminal" style={{ height }} aria-label="Output">
      <button
        type="button"
        className="terminal-resize"
        aria-label="Resize terminal"
        onPointerDown={onResizeStart}
      />
      <div className="terminal-body" ref={bodyRef}>
        {lines.length === 0 ? (
          <p className="terminal-empty">Waiting for output</p>
        ) : (
          lines.map((line) => (
            <p key={line.id} className="terminal-line">
              {line.text}
            </p>
          ))
        )}
      </div>
    </section>
  );
}
