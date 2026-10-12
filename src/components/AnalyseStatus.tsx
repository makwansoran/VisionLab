import { fmtClock, fmtDay, fmtDuration } from "../analyse/format";
import { t } from "../analyse/strings";
import { powerReason, type SiloStatus } from "../analyse/summary";

type Tone = "ok" | "warn" | "critical" | "muted";

type CardProps = {
  label: string;
  value: string;
  sub: string;
  tone: Tone;
  // One plain sentence, shown on hover, about what the card means.
  help: string;
  big?: boolean;
};

export function AnalyseStatus({ status, now }: { status: SiloStatus; now: number }) {
  const n = t.now;
  const when = (ms: number) => (sameDay(ms, now) ? fmtClock(ms) : `${fmtDay(ms)} ${fmtClock(ms)}`);
  const ago = (ms: number) => fmtDuration(Math.max(0, now - ms));
  const lastAt = status.lastContactAt;

  // The silo: red when empty, calm when full, grey when nobody can say, with the reason why.
  let silo: CardProps;
  if (status.silo === "empty" && status.siloSince !== null) {
    silo = { label: n.silo, value: n.empty, sub: `${n.since(when(status.siloSince))} · ${ago(status.siloSince)}`, tone: "critical", help: n.help.silo };
  } else if (status.silo === "full") {
    silo = { label: n.silo, value: n.full, sub: status.siloSince !== null ? n.since(when(status.siloSince)) : "", tone: "ok", help: n.help.silo };
  } else {
    const why =
      !status.contact && lastAt !== null
        ? n.noContactSince(when(lastAt))
        : status.cameraDownSince !== null
          ? n.cameraBlind(when(status.cameraDownSince))
          : status.ready === false
            ? n.notReady
            : n.noCheck;
    silo = { label: n.silo, value: n.unknown, sub: why, tone: "muted", help: n.help.silo };
  }

  const monitoring: CardProps = {
    label: n.monitoring,
    value: !status.contact ? (lastAt === null ? n.unknown : n.noContact) : status.monitoring === "on" ? n.on : status.monitoring === "off" ? n.off : n.unknown,
    sub: lastAt === null ? n.noCheck : !status.contact ? n.noContactSince(when(lastAt)) : status.ready === false ? n.notReady : n.lastSeen(ago(lastAt)),
    tone: lastAt === null ? "muted" : !status.contact || status.monitoring === "off" || status.ready === false ? "warn" : status.monitoring === "on" ? "ok" : "muted",
    help: n.help.monitoring,
  };

  const camera: CardProps = {
    label: n.camera,
    value: status.cameraDownSince !== null ? n.down : lastAt === null ? n.unknown : n.ok,
    sub: status.cameraDownSince !== null ? n.downSince(when(status.cameraDownSince)) : "",
    tone: status.cameraDownSince !== null ? "warn" : lastAt === null ? "muted" : "ok",
    help: n.help.camera,
  };

  const power: CardProps = status.power
    ? status.power.ok
      ? { label: n.power, value: n.ok, sub: n.lastChecked(when(status.power.at)), tone: "ok", help: n.help.power }
      : { label: n.power, value: n.unstable, sub: n.noted(n.powerReason[powerReason(status.power.throttled)], when(status.power.at)), tone: "warn", help: n.help.power }
    : { label: n.power, value: n.unknown, sub: n.noCheck, tone: "muted", help: n.help.power };

  const { sentAt, failedAt } = status.radio;
  const radio: CardProps =
    sentAt === null && failedAt === null
      ? { label: n.radio, value: n.unused, sub: "", tone: "muted", help: n.help.radio }
      : failedAt !== null && (sentAt === null || failedAt > sentAt)
        ? { label: n.radio, value: n.failed, sub: n.failedAt(when(failedAt)), tone: "warn", help: n.help.radio }
        : { label: n.radio, value: n.ok, sub: n.sentAt(when(sentAt as number)), tone: "ok", help: n.help.radio };

  return (
    <section className="ana-status" aria-label={n.title}>
      <h2 className="ana-h2">{n.title}</h2>
      <div className="ana-cards">
        <Card {...silo} big />
        <Card {...monitoring} />
        <Card {...camera} />
        <Card {...power} />
        <Card {...radio} />
      </div>
    </section>
  );
}

function Card({ label, value, sub, tone, help, big }: CardProps) {
  return (
    <div className={`ana-card ana-card-${tone}${big ? " ana-card-big" : ""}`} title={help}>
      <div className="ana-card-label">{label}</div>
      <div className="ana-card-value">{value}</div>
      {sub ? <div className="ana-card-sub">{sub}</div> : null}
    </div>
  );
}

function sameDay(a: number, b: number): boolean {
  return new Date(a).toDateString() === new Date(b).toDateString();
}
