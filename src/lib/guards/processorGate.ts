import { db } from "@/lib/db";
import { decodeList } from "@/lib/codec/json";

/**
 * PROCESSOR GATE — DPDP s.8(2)
 *
 * A Data Fiduciary may engage a Data Processor to process personal data on its
 * behalf ONLY under a valid contract. A processor registered while its DPA is
 * still being drafted therefore cannot lawfully be instructed yet.
 *
 * This is a HARD BLOCK, not a warning. The distinction matters: a warning makes
 * dispatching to a contractless processor a judgement call at the console, and
 * it is not one — there is no version of "the DPA is nearly signed" that makes
 * the instruction lawful. Onboarding Screen 5 lets a draft processor be SAVED
 * precisely so the block has something to bite on, rather than forcing people
 * to keep the record outside the system until legal finishes.
 *
 * Separately, `assertWithinDpaScope` enforces that the instruction stays inside
 * the categories the DPA actually covers — a valid contract for marketing data
 * is not authority to instruct about KYC data.
 */

export class DraftDpaError extends Error {
  constructor(name: string, dpaId: string) {
    super(
      `Cannot instruct ${name}: its DPA (${dpaId}) is still marked draft. ` +
        `DPDP s.8(2) permits a Processor to process personal data on the ` +
        `Fiduciary's behalf only under a valid contract, so no deletion or ` +
        `access instruction can be dispatched until the DPA is executed. ` +
        `Mark the DPA active once it is signed.`,
    );
    this.name = "DraftDpaError";
  }
}

export class OutsideDpaScopeError extends Error {
  readonly outside: string[];

  constructor(name: string, outside: string[]) {
    super(
      `Cannot instruct ${name} about ${outside.join(", ")}: ` +
        `${outside.length === 1 ? "that category is" : "those categories are"} ` +
        `outside the scope of its DPA. Instructing a Processor beyond its ` +
        `contract is processing without a lawful basis for it.`,
    );
    this.name = "OutsideDpaScopeError";
    this.outside = outside;
  }
}

export interface ProcessorPosture {
  processorId: string;
  name: string;
  dpaId: string;
  dpaStatus: string;
  /** False when the DPA is draft — dispatch is blocked outright. */
  dispatchable: boolean;
  blockReason: string | null;
  dpaScope: string[];
  dpaExpired: boolean;
  subProcessors: string[];
}

export async function getProcessorPosture(
  processorId: string,
  now: Date = new Date(),
): Promise<ProcessorPosture> {
  const p = await db.dataProcessor.findUniqueOrThrow({ where: { id: processorId } });

  const draft = p.dpaStatus === "draft";
  const expired = Boolean(p.dpaExpiresAt && p.dpaExpiresAt < now);

  return {
    processorId: p.id,
    name: p.name,
    dpaId: p.dpaId,
    dpaStatus: p.dpaStatus,
    dispatchable: !draft && !expired,
    blockReason: draft
      ? `The DPA is still draft. DPDP s.8(2) requires a valid contract before this Processor may process on our behalf.`
      : expired
        ? `The DPA expired on ${p.dpaExpiresAt?.toISOString().slice(0, 10)}. It must be renewed before further instructions.`
        : null,
    dpaScope: decodeList(p.dpaScopeJson),
    dpaExpired: expired,
    subProcessors: decodeList(p.subProcessorsJson),
  };
}

/** Call before any dispatch to a processor. Throws rather than warning. */
export async function assertDispatchable(processorId: string): Promise<void> {
  const posture = await getProcessorPosture(processorId);
  if (posture.dpaStatus === "draft") {
    throw new DraftDpaError(posture.name, posture.dpaId);
  }
}

export function assertWithinDpaScope(
  name: string,
  requested: readonly string[],
  dpaScope: readonly string[],
): void {
  const outside = requested.filter((c) => !dpaScope.includes(c));
  if (outside.length > 0) throw new OutsideDpaScopeError(name, outside);
}

/**
 * A DPA reference has no central registry to validate against, so this reports
 * FORMAT anomalies and never blocks. Blocking on a pattern the platform cannot
 * actually verify would reject valid references from any organisation whose
 * numbering differs from ours.
 */
export function inspectDpaReference(reference: string): {
  looksConventional: boolean;
  note: string | null;
} {
  const trimmed = reference.trim();
  if (!trimmed) {
    return { looksConventional: false, note: "A DPA reference is required." };
  }
  // The convention in use here is DPA-YYYY-NNN.
  if (/^DPA-\d{4}-\d{3,}$/.test(trimmed)) {
    return { looksConventional: true, note: null };
  }
  return {
    looksConventional: false,
    note:
      "This does not match the usual DPA-YYYY-NNN pattern. Saved as entered — " +
      "there is no registry to check it against, so this is a note, not a " +
      "rejection. Worth a second look if it was typed by hand.",
  };
}
