"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";
import { setScanCadence, runScheduledScan, publishCookiePolicyVersion } from "@/lib/engines/cookieCompliance";
import type { ActionResult } from "@/app/actions/requests";

function fail(e: unknown): ActionResult { const err = e as Error; return { ok: false, error: err.message, errorKind: err.name }; }
function touch(...p: string[]) { for (const x of p) revalidatePath(x, "layout"); }

export async function setScanCadenceAction(cadence: "on_demand" | "monthly"): Promise<ActionResult> {
  const { actor } = await getSession();
  try { await setScanCadence(cadence, actor); touch("/consent/scan-schedule"); return { ok: true }; } catch (e) { return fail(e); }
}

export async function runScheduledScanAction(): Promise<ActionResult & { flagged?: number }> {
  const { actor } = await getSession();
  try { const r = await runScheduledScan(actor); touch("/consent/scan-schedule", "/consent/script-scan"); return { ok: true, flagged: r.flagged }; } catch (e) { return fail(e); }
}

export async function publishCookiePolicyVersionAction(version: string, summary: string): Promise<ActionResult & { affected?: number }> {
  const { actor } = await getSession();
  try { const r = await publishCookiePolicyVersion(version, summary, actor); touch("/consent/policy-reconsent", "/consent/expiry"); return { ok: true, affected: r.affectedCount }; } catch (e) { return fail(e); }
}
