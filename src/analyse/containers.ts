import type { Container, ContainerId } from "./types";

// The pilot has one container. The data model supports more.
export const CONTAINERS: readonly Container[] = [{ id: "fetsund-c1", name: "Container 1", location: "Linje 1, Fetsund" }];

// One Pi per container. siteId is the site_id the Pi writes into its tables.
export const DEVICES: readonly { id: string; containerId: ContainerId; siteId: string }[] = [
  { id: "pi-fetsund-01", containerId: "fetsund-c1", siteId: "spectr-pi" },
];

export function containerForSite(siteId: string): ContainerId | null {
  return DEVICES.find((device) => device.siteId === siteId)?.containerId ?? null;
}
