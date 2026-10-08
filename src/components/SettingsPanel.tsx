import type { ReactNode } from "react";
import type { AppSettings, Resolution, ThemeName } from "../settings";

export type { ThemeName };

export function SettingsPanel({
  settings,
  onChange,
}: {
  settings: AppSettings;
  onChange: (patch: Partial<AppSettings>) => void;
}) {
  return (
    <main className="settings-page">
      <h1>Settings</h1>
      <section className="settings-group">
        <h2>User</h2>
        <div className="settings-card">
          <Row title="Name" detail="The name shown under Settings">
            <input
              className="settings-input"
              aria-label="Name"
              value={settings.displayName}
              onChange={(event) => onChange({ displayName: event.target.value })}
            />
          </Row>
          <Row title="Profile image" detail="The picture shown with your name">
            <img className="settings-avatar" src={settings.profileImage || "/profile.svg"} alt="" />
            <label className="settings-file">
              Change
              <input
                type="file"
                accept="image/*"
                hidden
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (!file) return;
                  void readProfileImage(file).then((profileImage) => onChange({ profileImage }));
                }}
              />
            </label>
          </Row>
        </div>
      </section>
      <section className="settings-group">
        <h2>Appearance</h2>
        <div className="settings-card">
          <Row title="Theme" detail="Choose a dark or white appearance">
            <span className="settings-theme-name">{settings.theme === "light" ? "White" : "Dark"}</span>
            <Toggle
              on={settings.theme === "light"}
              label={settings.theme === "light" ? "White" : "Dark"}
              onClick={() => onChange({ theme: settings.theme === "dark" ? "light" : "dark" })}
            />
          </Row>
        </div>
      </section>
      <section className="settings-group">
        <h2>Cameras</h2>
        <div className="settings-card">
          <Row title="Confirm before delete" detail="Ask before a camera is removed from a project">
            <Toggle
              on={settings.confirmDelete}
              label="Confirm before delete"
              onClick={() => onChange({ confirmDelete: !settings.confirmDelete })}
            />
          </Row>
          <Row title="Start cameras automatically" detail="Open a camera as soon as it is added">
            <Toggle
              on={settings.autoStart}
              label="Start cameras automatically"
              onClick={() => onChange({ autoStart: !settings.autoStart })}
            />
          </Row>
          <Row title="Mirror preview" detail="Flip the picture from a camera on this computer">
            <Toggle
              on={settings.mirrorPreview}
              label="Mirror preview"
              onClick={() => onChange({ mirrorPreview: !settings.mirrorPreview })}
            />
          </Row>
          <Row title="Camera quality" detail="Resolution requested the next time a camera opens">
            <select
              className="settings-select"
              aria-label="Camera quality"
              value={settings.resolution}
              onChange={(event) => onChange({ resolution: event.target.value as Resolution })}
            >
              <option value="720">720p</option>
              <option value="1080">1080p</option>
            </select>
          </Row>
        </div>
      </section>
      <section className="settings-group">
        <h2>Workspace</h2>
        <div className="settings-card">
          <Row title="Reopen last project" detail="Return to the project you were using when VisionLab starts">
            <Toggle
              on={settings.reopenProject}
              label="Reopen last project"
              onClick={() => onChange({ reopenProject: !settings.reopenProject })}
            />
          </Row>
        </div>
      </section>
    </main>
  );
}

function Row({ title, detail, children }: { title: string; detail: string; children: ReactNode }) {
  return (
    <div className="settings-row">
      <div>
        <p>{title}</p>
        <p>{detail}</p>
      </div>
      <div className="settings-control">{children}</div>
    </div>
  );
}

function readProfileImage(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error("Could not read the image"));
      image.onload = () => {
        const size = 128;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const context = canvas.getContext("2d");
        if (!context) {
          resolve(String(reader.result ?? ""));
          return;
        }
        const scale = Math.max(size / image.width, size / image.height);
        const width = image.width * scale;
        const height = image.height * scale;
        context.drawImage(image, (size - width) / 2, (size - height) / 2, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      };
      image.src = String(reader.result ?? "");
    };
    reader.readAsDataURL(file);
  });
}

function Toggle({ on, label, onClick }: { on: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      className={on ? "ios-toggle on" : "ios-toggle"}
      aria-checked={on}
      aria-label={label}
      onClick={onClick}
    >
      <span />
    </button>
  );
}
