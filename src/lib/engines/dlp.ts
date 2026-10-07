import { db } from "@/lib/db";

/**
 * DLP (discovery source) connection health.
 *
 * Discovery, classification and scanning now live in the DLP. Privacy Admin only
 * reads from it, so all we track here is the connection's health: whether it is
 * connected, whether the last sync failed, when it last synced, and how stale is
 * "too stale". This drives the warning on Data inventory in the nav and the
 * Settings › Integrations › DLP page. State is held on the IntegrationConfig
 * singleton so there is a single source of truth and it is demo-switchable.
 */

export type DlpState = "connected" | "not_connected" | "failed" | "stale";

export interface DlpHealth {
  connected: boolean;
  syncFailed: boolean;
  lastSyncAt: Date | null;
  syncIntervalHours: number;
  state: DlpState;
  /** One short line for a warning, or null when healthy. Safe to pass to a client. */
  warnText: string | null;
  /** "2 hours ago" style relative time for the last sync, or null. */
  lastSyncAgo: string | null;
}

function agoText(date: Date, now = Date.now()): string {
  const s = Math.max(0, Math.floor((now - date.getTime()) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} minute${m === 1 ? "" : "s"} ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
  const d = Math.floor(h / 24);
  return `${d} day${d === 1 ? "" : "s"} ago`;
}

async function readConfig() {
  return db.integrationConfig.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton" },
  });
}

export async function getDlpHealth(now = Date.now()): Promise<DlpHealth> {
  const c = await readConfig();
  const lastSyncAt = c.dlpLastSyncAt ?? null;
  const lastSyncAgo = lastSyncAt ? agoText(lastSyncAt, now) : null;
  const stale = !!lastSyncAt && now - lastSyncAt.getTime() > c.dlpSyncIntervalHours * 3600_000;

  let state: DlpState;
  let warnText: string | null;
  if (!c.dlpConnected) { state = "not_connected"; warnText = "DLP not connected"; }
  else if (c.dlpSyncFailed) { state = "failed"; warnText = lastSyncAt ? `DLP sync failed ${lastSyncAgo}` : "DLP sync failed"; }
  else if (stale) { state = "stale"; warnText = "DLP data is out of date"; }
  else { state = "connected"; warnText = null; }

  return { connected: c.dlpConnected, syncFailed: c.dlpSyncFailed, lastSyncAt, syncIntervalHours: c.dlpSyncIntervalHours, state, warnText, lastSyncAgo };
}

/** Demo switcher used by the Settings › Integrations › DLP page. */
export async function setDlpState(state: DlpState): Promise<void> {
  const now = new Date();
  const data =
    state === "not_connected" ? { dlpConnected: false, dlpSyncFailed: false } :
    state === "failed" ? { dlpConnected: true, dlpSyncFailed: true } :
    state === "stale" ? { dlpConnected: true, dlpSyncFailed: false, dlpLastSyncAt: new Date(now.getTime() - 1000 * 3600 * 24 * 3) } :
    { dlpConnected: true, dlpSyncFailed: false, dlpLastSyncAt: now };
  await db.integrationConfig.upsert({ where: { id: "singleton" }, update: data, create: { id: "singleton", ...data } });
}

/** "Sync now" — mark a fresh, successful, connected sync. */
export async function syncDlpNow(): Promise<void> {
  await db.integrationConfig.upsert({
    where: { id: "singleton" },
    update: { dlpConnected: true, dlpSyncFailed: false, dlpLastSyncAt: new Date() },
    create: { id: "singleton", dlpLastSyncAt: new Date() },
  });
}
