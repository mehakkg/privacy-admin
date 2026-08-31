import { cookies } from "next/headers";
import { db } from "@/lib/db";
import type { ActorRole } from "@/lib/domain";
import type { AuditActor } from "@/lib/engines/audit";

/**
 * Acting identity.
 *
 * There is no authentication in this build. The active role comes from a cookie
 * and defaults to `admin`, which is the module this product surface is for.
 *
 * The role switcher exists so the guards can be demonstrated rather than taken
 * on trust: switch to DPO to record a ruling, switch back to Admin and watch
 * the same mutation be refused. Replacing this file with a real session lookup
 * is the only change needed to put it behind auth — every guard already takes
 * the role as an argument rather than assuming it.
 */

const ROLE_COOKIE = "pa_role";
const DEFAULT_ROLE: ActorRole = "admin";

const VALID_ROLES: readonly ActorRole[] = [
  "admin",
  "dpo",
  "ciso",
  "grievance_officer",
];

export async function getCurrentRole(): Promise<ActorRole> {
  const store = await cookies();
  const value = store.get(ROLE_COOKIE)?.value as ActorRole | undefined;
  return value && VALID_ROLES.includes(value) ? value : DEFAULT_ROLE;
}

export interface Session {
  role: ActorRole;
  actor: AuditActor;
}

export async function getSession(): Promise<Session> {
  const role = await getCurrentRole();
  const actor = await db.actor.findFirst({ where: { role } });

  return {
    role,
    actor: {
      id: actor?.id ?? null,
      label: actor?.name ?? `Unassigned ${role}`,
      role,
    },
  };
}

export { ROLE_COOKIE, VALID_ROLES };
