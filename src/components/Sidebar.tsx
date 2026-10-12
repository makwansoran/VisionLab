import type { ReactElement } from "react";

export type SectionId = "vision" | "analyse" | "notifications" | "settings";

const items: { id: SectionId; label: string; icon: () => ReactElement }[] = [
  { id: "vision", label: "Home", icon: IconHome },
  { id: "analyse", label: "Analyse", icon: IconChart },
  { id: "notifications", label: "Notifications", icon: IconBell },
];

export function Sidebar({
  active,
  onChange,
  name,
  image,
  plan,
}: {
  active: SectionId;
  onChange: (id: SectionId) => void;
  name: string;
  image: string;
  plan: string | null;
}) {
  return (
    <aside className="sidebar">
      <div className="brand" title="VisionLab">
        <div className="vision-brand">
          <img src="/spectr-logo.png" alt="" />
          <span>VisionLab</span>
          <small>by SPECTR</small>
        </div>
      </div>
      <nav className="nav" aria-label="Main">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              className={active === item.id ? "nav-item is-plain active" : "nav-item is-plain"}
              aria-pressed={active === item.id}
              title={item.label}
              onClick={() => onChange(item.id)}
            >
              <Icon />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
      <button
        type="button"
        className={active === "settings" ? "nav-item active" : "nav-item"}
        aria-pressed={active === "settings"}
        title="Settings"
        onClick={() => onChange("settings")}
      >
        <IconSettings />
        <span>Settings</span>
      </button>
      <button
        type="button"
        className="user-area"
        title={name}
        onClick={() => onChange("settings")}
      >
        <img src={image || "/profile.svg"} alt="" />
        <span>{name}</span>
        {plan && <span className="account-badge">{plan}</span>}
      </button>
    </aside>
  );
}

function IconHome() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 11 12 4l8 7" />
      <path d="M6 10v9h12v-9" />
    </svg>
  );
}

function IconChart() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 19.5h16" />
      <path d="M7 16.5v-5" />
      <path d="M12 16.5V6.5" />
      <path d="M17 16.5v-3" />
    </svg>
  );
}

function IconBell() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 9.5a6 6 0 0 1 12 0c0 4.2 1.2 5.8 1.8 6.5H4.2C4.8 15.3 6 13.7 6 9.5Z" />
      <path d="M10 18.5a2 2 0 0 0 4 0" />
    </svg>
  );
}

function IconSettings() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
    </svg>
  );
}
