import { db } from "@/lib/db";

/**
 * GOVERNANCE PORTAL CLIENT (stub)
 *
 * The Governance Portal (DPO, CISO) is a separate application sharing this
 * backend. It does not exist in this build, so this module stands in for the
 * network call Admin would really make: fetch the DPO roster and the statutory
 * retention categories the DPO has defined.
 *
 * It is written as a client with a failure mode rather than a direct database
 * read, because the failure mode is part of the spec — Screen 1 has to behave
 * correctly when governance configuration cannot be loaded, and a function that
 * can never fail cannot be used to build that.
 *
 * SIMULATION FLAGS. Every edge case Screen 1 must handle is reachable from the
 * URL, so the states can actually be demonstrated rather than described:
 *
 *   ?sim=gov_down        — portal unreachable
 *   ?sim=no_dpo          — no DPO assigned yet
 *   ?sim=no_categories   — retention category list empty
 *   ?sim=multi_entity    — more than one DPO, entity-scoped routing
 *   ?sim=bad_backup      — backup contact has no notification channel
 *
 * These are read from the page's searchParams and passed in. Nothing here reads
 * global state, so the flags cannot leak between requests.
 */

export type GovernanceSim =
  | "gov_down"
  | "no_dpo"
  | "no_categories"
  | "multi_entity"
  | "bad_backup";

export class GovernancePortalUnreachableError extends Error {
  constructor() {
    super(
      "Unable to load governance configuration. The Governance Portal did not " +
        "respond.",
    );
    this.name = "GovernancePortalUnreachableError";
  }
}

export interface GovernanceContact {
  id: string;
  name: string;
  role: string;
  /** Entity this contact covers. Null means the primary entity. */
  entity: string | null;
  /** A contact with no channel cannot be notified, so cannot be a backup. */
  hasNotificationChannel: boolean;
  /** The contact's own preference. Respected, not overridden. */
  notificationsMuted: boolean;
}

export interface GovernanceRetentionCategory {
  id: string;
  name: string;
  retentionPeriod: string;
  statuteRef: string;
  description: string;
  approvedBy: string;
  approvedAt: Date;
}

export interface GovernanceConfig {
  contacts: GovernanceContact[];
  retentionCategories: GovernanceRetentionCategory[];
  multiEntity: boolean;
}

export function parseSim(raw: string | string[] | undefined): Set<GovernanceSim> {
  const values = Array.isArray(raw) ? raw : raw ? raw.split(",") : [];
  return new Set(values.map((v) => v.trim()) as GovernanceSim[]);
}

/**
 * Fetch the governance configuration Screen 1 depends on.
 *
 * Throws GovernancePortalUnreachableError when the portal is down. The caller
 * decides what to do about it — this module does not silently substitute empty
 * data for a failed fetch, because "no categories configured" and "could not
 * find out whether categories are configured" are different facts and Screen 1
 * has to say which one it is.
 */
export async function fetchGovernanceConfig(
  sim: Set<GovernanceSim> = new Set(),
): Promise<GovernanceConfig> {
  if (sim.has("gov_down")) throw new GovernancePortalUnreachableError();

  const [actors, categories] = await Promise.all([
    db.actor.findMany({
      where: { role: { in: ["dpo", "ciso", "grievance_officer"] } },
      orderBy: { name: "asc" },
    }),
    sim.has("no_categories")
      ? Promise.resolve([])
      : db.retentionCategory.findMany({ orderBy: { name: "asc" } }),
  ]);

  const dpos = actors.filter((a) => a.role === "dpo");

  const contacts: GovernanceContact[] = actors
    .filter((a) => (sim.has("no_dpo") ? a.role !== "dpo" : true))
    .map((a, i) => ({
      id: a.id,
      name: a.name,
      role: a.role,
      entity:
        sim.has("multi_entity") && a.role === "dpo" && i % 2 === 1
          ? "Retail Lending Ltd"
          : null,
      // The CISO is reachable; the Grievance Officer in this fixture is the one
      // without a channel, so `bad_backup` has something real to catch.
      hasNotificationChannel: sim.has("bad_backup")
        ? a.role !== "grievance_officer"
        : true,
      notificationsMuted: a.role === "ciso",
    }));

  // The multi-entity case needs a second DPO to be a real case.
  if (sim.has("multi_entity") && dpos.length === 1 && !sim.has("no_dpo")) {
    contacts.push({
      id: "act_dpo_entity2",
      name: "N. Bhatt",
      role: "dpo",
      entity: "Retail Lending Ltd",
      hasNotificationChannel: true,
      notificationsMuted: false,
    });
  }

  return {
    contacts,
    retentionCategories: categories.map((c) => ({
      id: c.id,
      name: c.name,
      retentionPeriod: c.retentionPeriod,
      statuteRef: c.statuteRef,
      description: c.description,
      approvedBy: c.approvedBy,
      approvedAt: c.approvedAt,
    })),
    multiEntity: sim.has("multi_entity"),
  };
}
