"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";
import { audited } from "@/lib/engines/audit";
import type { TxClient } from "@/lib/tx";
import type { ActionResult } from "@/app/actions/requests";
import { GOVERNANCE } from "@/lib/governance";

/**
 * Set the org governance structure. Changing it never alters existing approval
 * records' self_approved flag — that is historical. Going forward it only changes
 * how NEW requests route (to a dedicated DPO, or back to the same person as DPO).
 */
export async function setGovernanceStructureAction(structure: string): Promise<ActionResult> {
  const { actor } = await getSession();
  if (structure !== GOVERNANCE.DEDICATED && structure !== GOVERNANCE.COMBINED) {
    return { ok: false, error: "Unknown governance structure.", errorKind: "ValidationError" };
  }
  try {
    await audited(
      { actor, action: "org.governance_set", targetType: "OrgSettings", targetId: "org", payload: { governanceStructure: structure } },
      (tx: TxClient) => tx.orgSettings.upsert({
        where: { id: "org" },
        update: { governanceStructure: structure, updatedBy: actor.label },
        create: { id: "org", governanceStructure: structure, updatedBy: actor.label },
      }),
    );
    revalidatePath("/access/organization", "layout");
    revalidatePath("/access/approval-queue", "layout");
    return { ok: true };
  } catch (error) {
    const e = error as Error;
    return { ok: false, error: e.message, errorKind: e.name };
  }
}
