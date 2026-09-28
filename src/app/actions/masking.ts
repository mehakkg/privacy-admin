"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";
import {
  saveRule,
  unlockRule,
  createField,
  checkCodeCollision,
  type CreateFieldInput,
  type Collision,
} from "@/lib/engines/masking";

/**
 * Masking config server actions — thin adapters over the engine. Refusals come
 * back as a result object (never thrown to the client) so a rejected save renders
 * as a specific banner on the screen the user is already on. The conflict and
 * collision cases carry structured detail, because "please retry" is exactly the
 * generic error Screen 3 and Screen 4 exist to replace.
 */

export interface MaskingActionResult {
  ok: boolean;
  error?: string;
  errorKind?: string;
  conflict?: { currentVersion: number | null; changedBy: string | null; changedAt: string | null; currentMethod: string | null };
  collisions?: Collision[];
}

function fail(e: unknown): MaskingActionResult {
  const err = e as Error & { currentVersion?: number | null; changedBy?: string | null; changedAt?: string | null; currentMethod?: string | null; collisions?: Collision[] };
  const out: MaskingActionResult = { ok: false, error: err.message, errorKind: err.name };
  if (err.name === "ConflictError") {
    out.conflict = {
      currentVersion: err.currentVersion ?? null,
      changedBy: err.changedBy ?? null,
      changedAt: err.changedAt ?? null,
      currentMethod: err.currentMethod ?? null,
    };
  }
  if (err.name === "CollisionError") out.collisions = err.collisions ?? [];
  return out;
}

function touch() {
  revalidatePath("/masking/fields", "layout");
  revalidatePath("/masking/audit", "layout");
}

export async function saveRuleAction(id: string, expectedVersion: number, method: string): Promise<MaskingActionResult> {
  const { actor } = await getSession();
  try {
    await saveRule(id, expectedVersion, method, actor);
    touch();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function unlockRuleAction(id: string): Promise<MaskingActionResult> {
  const { actor } = await getSession();
  try {
    await unlockRule(id, actor);
    touch();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function createFieldAction(input: CreateFieldInput): Promise<MaskingActionResult> {
  const { actor } = await getSession();
  try {
    await createField(input, actor);
    touch();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Live collision pre-check for Screen 4 — read-only, safe to call on each keystroke. */
export async function checkCollisionAction(code: string): Promise<{ collisions: Collision[] }> {
  return { collisions: await checkCodeCollision(code) };
}
