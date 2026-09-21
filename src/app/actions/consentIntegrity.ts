"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { hashConsent } from "@/lib/consentHash";
import type { ActionResult } from "@/app/actions/requests";

export interface SpotCheckResult extends ActionResult {
  storedHash?: string | null;
  recomputedHash?: string;
  matched?: boolean;
  checkedAt?: string;
}

/**
 * Run a live verification spot-check: recompute the artifact's hash from stored
 * content and compare to the hash stored at creation. Records a VerificationCheck
 * (audit evidence) and returns both hashes for the drawer. Read-only w.r.t. the
 * artifact — it can only confirm, never change.
 */
export async function runSpotCheckAction(artifactId: string): Promise<SpotCheckResult> {
  const { actor } = await getSession();
  try {
    const a = await db.consentRecord.findUniqueOrThrow({ where: { id: artifactId } });
    const recomputedHash = hashConsent({ subjectRef: a.subjectRef, purposeTagId: a.purposeTagId, channelOrigin: a.channelOrigin, status: a.status, collectedAt: a.collectedAt });
    const stored = a.artifactHash;
    const matched = stored != null && stored === recomputedHash;
    const check = await db.verificationCheck.create({
      data: { artifactId, recomputedHash, result: matched ? "match" : "mismatch", checkedBy: actor.label },
    });
    revalidatePath("/consent/integrity", "layout");
    return { ok: true, storedHash: stored, recomputedHash, matched, checkedAt: check.checkedAt.toISOString() };
  } catch (error) {
    const e = error as Error;
    return { ok: false, error: e.message, errorKind: e.name };
  }
}
