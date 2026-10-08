export type ThemeName = "dark" | "light";
export type Resolution = "720" | "1080";

export type AppSettings = {
  displayName: string;
  profileImage: string;
  theme: ThemeName;
  confirmDelete: boolean;
  autoStart: boolean;
  mirrorPreview: boolean;
  resolution: Resolution;
  reopenProject: boolean;
};

const storageKey = "visionlab-settings";
const themeKey = "visionlab-theme";
const projectKey = "visionlab-last-project";

export const defaultSettings: AppSettings = {
  displayName: "User",
  profileImage: "",
  theme: "dark",
  confirmDelete: true,
  autoStart: true,
  mirrorPreview: false,
  resolution: "720",
  reopenProject: false,
};

function isResolution(value: unknown): value is Resolution {
  return value === "720" || value === "1080";
}

export function loadSettings(): AppSettings {
  const theme = localStorage.getItem(themeKey) === "light" ? "light" : "dark";
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return { ...defaultSettings, theme };
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return { ...defaultSettings, theme };
    const saved = parsed as Partial<AppSettings>;
    return {
      displayName: typeof saved.displayName === "string" && saved.displayName.trim() ? saved.displayName : defaultSettings.displayName,
      profileImage: typeof saved.profileImage === "string" ? saved.profileImage : defaultSettings.profileImage,
      theme,
      confirmDelete: typeof saved.confirmDelete === "boolean" ? saved.confirmDelete : defaultSettings.confirmDelete,
      autoStart: typeof saved.autoStart === "boolean" ? saved.autoStart : defaultSettings.autoStart,
      mirrorPreview: typeof saved.mirrorPreview === "boolean" ? saved.mirrorPreview : defaultSettings.mirrorPreview,
      resolution: isResolution(saved.resolution) ? saved.resolution : defaultSettings.resolution,
      reopenProject: typeof saved.reopenProject === "boolean" ? saved.reopenProject : defaultSettings.reopenProject,
    };
  } catch {
    return { ...defaultSettings, theme };
  }
}

export function saveSettings(settings: AppSettings) {
  localStorage.setItem(themeKey, settings.theme);
  localStorage.setItem(
    storageKey,
    JSON.stringify({
      displayName: settings.displayName,
      profileImage: settings.profileImage,
      confirmDelete: settings.confirmDelete,
      autoStart: settings.autoStart,
      mirrorPreview: settings.mirrorPreview,
      resolution: settings.resolution,
      reopenProject: settings.reopenProject,
    }),
  );
}

export function loadLastProject() {
  return localStorage.getItem(projectKey);
}

export function saveLastProject(id: string) {
  localStorage.setItem(projectKey, id);
}

export function resolutionSize(resolution: Resolution) {
  return resolution === "1080" ? { width: 1920, height: 1080 } : { width: 1280, height: 720 };
}
