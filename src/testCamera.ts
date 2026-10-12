// A camera that needs no hardware: a canvas drawn at a steady rate and captured as a
// stream, so a laptop without a webcam can still go through the whole vision flow.
export const TEST_CAMERA_ID = "test-camera";
export const TEST_CAMERA_LABEL = "Testing";

const FPS = 15;
const COLORS = ["#7eb6ff", "#f0c36a", "#8fd19e", "#e08cff", "#ff8b7a"];

export type TestCycleStep = "empty" | "radio" | "full";

// The picture shows the silo state the cycle below acts out, so the tracker and the feed agree.
let empty = false;

export function isTestCamera(deviceId: string | null | undefined) {
  return deviceId === TEST_CAMERA_ID;
}

export function openTestCamera(size: { width: number; height: number }): MediaStream {
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext("2d");
  const stream = canvas.captureStream(FPS);
  const track = stream.getVideoTracks()[0];
  const started = Date.now();
  let frame = 0;

  const draw = () => {
    // Stopping the track is how feeds let go of a camera; the loop ends with it.
    if (!context || !track || track.readyState === "ended") return;
    const { width, height } = canvas;
    const elapsed = (Date.now() - started) / 1000;
    context.fillStyle = "#1b1d22";
    context.fillRect(0, 0, width, height);

    const bar = width / COLORS.length;
    COLORS.forEach((color, index) => {
      context.fillStyle = color;
      context.fillRect(index * bar, 0, bar, height * 0.18);
    });

    // A moving disc, so a frozen picture is easy to tell from a live one. Red while the silo is "empty".
    const radius = Math.min(width, height) * 0.08;
    const x = width / 2 + Math.cos(elapsed) * width * 0.3;
    const y = height * 0.58 + Math.sin(elapsed * 1.7) * height * 0.2;
    context.fillStyle = empty ? "#e85d5d" : "#eceae4";
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();

    context.fillStyle = "#8d919a";
    context.font = `${Math.round(height * 0.05)}px Ubuntu, "Segoe UI", sans-serif`;
    context.textBaseline = "bottom";
    const state = empty ? " · empty" : "";
    context.fillText(`${TEST_CAMERA_LABEL} · ${new Date().toLocaleTimeString()} · frame ${frame}${state}`, width * 0.04, height * 0.95);

    frame += 1;
    window.setTimeout(draw, 1000 / FPS);
  };

  draw();
  return stream;
}

// One silo cycle every three minutes: the silo runs empty, the radio message goes out a few
// seconds later, and a minute on the silo is refilled. Enough for the tracker to show something
// before Argus runs, without flooding the lists.
export function startTestCycle(emit: (step: TestCycleStep) => void): () => void {
  const steps: [number, TestCycleStep][] = [
    [20_000, "empty"],
    [26_000, "radio"],
    [80_000, "full"],
  ];
  let timers: number[] = [];

  const round = () => {
    timers = steps.map(([ms, step]) =>
      window.setTimeout(() => {
        if (step === "empty") empty = true;
        if (step === "full") empty = false;
        emit(step);
      }, ms),
    );
    timers.push(window.setTimeout(round, 180_000));
  };

  round();
  return () => {
    timers.forEach((timer) => window.clearTimeout(timer));
    empty = false;
  };
}
