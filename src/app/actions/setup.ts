"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { PROFILE_COOKIE, PLAN_VIEWED_COOKIE, SETUP_COOKIE, getSetupState } from "@/lib/setup/state";
import type { ProfileAnswers } from "@/lib/setup/plan";
import type { SetupState, SetupRole } from "@/lib/setup/tasks";

const YEAR = 60 * 60 * 24 * 365;

async function writeSetup(next: SetupState): Promise<void> {
  const store = await cookies();
  store.set(SETUP_COOKIE, JSON.stringify(next), { path: "/", maxAge: YEAR, sameSite: "lax" });
  revalidatePath("/setup", "page");
  revalidatePath("/dashboard", "page");
}

/** Mark a setup task done. Audit logging would attach here automatically. */
export async function completeTaskAction(id: string): Promise<{ ok: true }> {
  const s = await getSetupState();
  await writeSetup({ ...s, done: { ...s.done, [id]: true } });
  return { ok: true };
}

/** Invite roles (A4). A4 is done once DPO + Grievance are invited. */
export async function inviteRolesAction(roles: SetupRole[]): Promise<{ ok: true }> {
  const s = await getSetupState();
  const invited = [...new Set([...s.invited, ...roles])];
  await writeSetup({ ...s, invited });
  return { ok: true };
}

/** Enable a customer-facing capability (the go-live gate). */
export async function enableCapabilityAction(cap: "portal" | "notices" | "consent"): Promise<{ ok: true }> {
  const s = await getSetupState();
  await writeSetup({ ...s, caps: { ...s.caps, [cap]: true } });
  return { ok: true };
}

/** Reassign a task to another role (only C1/C2 → Admin, when no CISO is invited). */
export async function reassignTaskAction(id: string, role: SetupRole): Promise<{ ok: true }> {
  const s = await getSetupState();
  await writeSetup({ ...s, reassigned: { ...s.reassigned, [id]: role } });
  return { ok: true };
}

/** Save the readiness profile (org-level). Autosaved on every answer, so a second
 *  Admin resumes the same state. */
export async function saveProfileAction(answers: ProfileAnswers): Promise<{ ok: true }> {
  const store = await cookies();
  store.set(PROFILE_COOKIE, JSON.stringify(answers), { path: "/", maxAge: YEAR, sameSite: "lax" });
  return { ok: true };
}

/** Record that the current role has seen the plan (shown once per user). */
export async function markPlanViewedAction(role: string): Promise<{ ok: true }> {
  const store = await cookies();
  let roles: string[] = [];
  try { roles = JSON.parse(store.get(PLAN_VIEWED_COOKIE)?.value ?? "[]"); } catch { roles = []; }
  if (!roles.includes(role)) roles.push(role);
  store.set(PLAN_VIEWED_COOKIE, JSON.stringify(roles), { path: "/", maxAge: YEAR, sameSite: "lax" });
  return { ok: true };
}
