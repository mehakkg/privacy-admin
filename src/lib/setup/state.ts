import { cookies } from "next/headers";
import type { ProfileAnswers } from "./plan";
import { DEFAULT_STATE, type SetupState } from "./tasks";

/**
 * Setup state is org-level and lives in server-readable cookies (this Neon setup
 * can't take new Prisma schema reliably). The route guard and every setup screen
 * read these on the server so there is never a flash of a gated page.
 */
export const PROFILE_COOKIE = "pa_readiness";
export const PLAN_VIEWED_COOKIE = "pa_plan_viewed";
export const SETUP_COOKIE = "pa_setup";

export async function getSetupState(): Promise<SetupState> {
  try {
    const v = (await cookies()).get(SETUP_COOKIE)?.value;
    if (!v) return DEFAULT_STATE;
    const p = JSON.parse(v) as Partial<SetupState>;
    return {
      done: { ...DEFAULT_STATE.done, ...(p.done ?? {}) },
      invited: p.invited ?? [],
      reassigned: p.reassigned ?? {},
      caps: { ...DEFAULT_STATE.caps, ...(p.caps ?? {}) },
    };
  } catch { return DEFAULT_STATE; }
}

export async function getProfile(): Promise<ProfileAnswers> {
  try { const v = (await cookies()).get(PROFILE_COOKIE)?.value; return v ? (JSON.parse(v) as ProfileAnswers) : {}; }
  catch { return {}; }
}

export async function getPlanViewedRoles(): Promise<string[]> {
  try { const v = (await cookies()).get(PLAN_VIEWED_COOKIE)?.value; return v ? (JSON.parse(v) as string[]) : []; }
  catch { return []; }
}
