"use server";

import { cookies } from "next/headers";
import { PROFILE_COOKIE, PLAN_VIEWED_COOKIE } from "@/lib/setup/state";
import type { ProfileAnswers } from "@/lib/setup/plan";

const YEAR = 60 * 60 * 24 * 365;

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
