/**
 * PROCESSING ACTIVITIES — pure business logic (no DB, no React).
 *
 * Every status, next step, rail label and list sentence the UI shows comes from
 * here, so it can be unit-tested in isolation (see ./logic.test.ts). Components
 * render only what these return.
 */
import { purposeState, type Activity, type ActivityPurpose, type Ctx } from "@/lib/activities/types";

// --- Basics -----------------------------------------------------------------

export type BasicsGap = "owner" | "entity" | "principals";
export function basicsGaps(a: Activity, multiEntity: boolean): BasicsGap[] {
  const gaps: BasicsGap[] = [];
  if (!a.ownerId) gaps.push("owner");
  if (multiEntity && !a.entityId) gaps.push("entity");
  if (a.principals.length === 0) gaps.push("principals");
  return gaps;
}

export function confirmedPurposes(a: Activity): ActivityPurpose[] {
  return a.purposeLinks.filter((p) => p.state === "confirmed");
}

const confirmedData = (p: ActivityPurpose) => p.dataLinks.filter((d) => d.state === "confirmed");
const confirmedProcessors = (p: ActivityPurpose) => p.processorLinks.filter((p2) => p2.state === "confirmed");

// --- Completeness -----------------------------------------------------------

export type CompletenessKind =
  | "needs_basics" | "needs_purpose" | "needs_approval" | "needs_data" | "needs_processors"
  | "needs_review" | "complete" | "retired";

export interface Completeness { kind: CompletenessKind; subKind?: "waiting_only" }

/** Is a confirmed purpose approved for use (has an approved version in force)? */
function approvedForUse(a: Activity, ctx: Ctx, link: ActivityPurpose): boolean {
  return purposeState(ctx.purposes[link.purposeId]).approvedForUse;
}

export function completeness(a: Activity, ctx: Ctx): Completeness {
  if (a.lifecycle === "retired") return { kind: "retired" };
  if (basicsGaps(a, ctx.multiEntity).length > 0) return { kind: "needs_basics" };
  const confirmed = confirmedPurposes(a);
  if (confirmed.length === 0) return { kind: "needs_purpose" };
  const notApproved = confirmed.filter((p) => !approvedForUse(a, ctx, p));
  if (notApproved.length > 0) {
    const allWaiting = notApproved.every((p) => purposeState(ctx.purposes[p.purposeId]).state === "waiting_for_dpo");
    return { kind: "needs_approval", subKind: allWaiting ? "waiting_only" : undefined };
  }
  if (confirmed.some((p) => confirmedData(p).length === 0)) return { kind: "needs_data" };
  if (confirmed.some((p) => p.processorMode === "unanswered" || (p.processorMode === "uses_processors" && confirmedProcessors(p).length === 0))) return { kind: "needs_processors" };
  if (a.lifecycle === "under_review") return { kind: "needs_review" };
  return { kind: "complete" };
}

export function completenessLabel(c: Completeness): string {
  switch (c.kind) {
    case "needs_basics": return "Needs the basics";
    case "needs_purpose": return "Needs a purpose";
    case "needs_approval": return c.subKind === "waiting_only" ? "Waiting for your DPO" : "Needs a purpose approval";
    case "needs_data": return "Needs data";
    case "needs_processors": return "Needs processors";
    case "needs_review": return "Needs review";
    case "complete": return "Ready for ROPA";
    case "retired": return "Retired";
  }
}

// --- Next step --------------------------------------------------------------

export interface NextStepTarget { pane: "basics" | "purpose" | "review" | "activate"; purpose?: string; section?: "data" | "processors"; addPurpose?: boolean }
export interface NextStep { text: string; verb: string; target: NextStepTarget | null; actionable: boolean }

export function nextStep(a: Activity, ctx: Ctx): NextStep {
  const c = completeness(a, ctx);
  const none = (): NextStep => ({ text: "", verb: "", target: null, actionable: false });
  switch (c.kind) {
    case "complete":
    case "retired":
      return none();
    case "needs_basics": {
      const g = basicsGaps(a, ctx.multiEntity)[0];
      const verb = g === "owner" ? "Add an owner" : g === "entity" ? "Choose an entity" : "Choose whose data";
      return { text: verb, verb, target: { pane: "basics" }, actionable: true };
    }
    case "needs_purpose": {
      const hasSuggested = a.purposeLinks.some((p) => p.state === "suggested");
      return hasSuggested
        ? { text: "Confirm suggested purposes", verb: "Confirm suggested purposes", target: { pane: "purpose" }, actionable: true }
        : { text: "Add a purpose", verb: "Add a purpose", target: { pane: "purpose", addPurpose: true }, actionable: true };
    }
    case "needs_approval": {
      if (c.subKind === "waiting_only") return { text: "Waiting for your DPO", verb: "Waiting for your DPO", target: null, actionable: false };
      const notApproved = confirmedPurposes(a).filter((p) => !approvedForUse(a, ctx, p));
      const actionablePurposes = notApproved.filter((p) => { const s = purposeState(ctx.purposes[p.purposeId]).state; return s === "draft" || s === "changes_requested" || s === "rejected"; });
      const first = actionablePurposes[0];
      if (actionablePurposes.length > 1) return { text: `Submit ${actionablePurposes.length} purposes for approval`, verb: `Submit ${actionablePurposes.length} purposes for approval`, target: { pane: "purpose", purpose: first?.purposeId }, actionable: true };
      const s = first ? purposeState(ctx.purposes[first.purposeId]).state : "draft";
      const verb = s === "changes_requested" ? "Resubmit 1 purpose" : s === "rejected" ? "Edit 1 rejected purpose" : "Submit 1 purpose for approval";
      return { text: verb, verb, target: { pane: "purpose", purpose: first?.purposeId }, actionable: true };
    }
    case "needs_data": {
      const need = confirmedPurposes(a).filter((p) => confirmedData(p).length === 0);
      const verb = `Add data to ${need.length} purpose${need.length === 1 ? "" : "s"}`;
      return { text: verb, verb, target: { pane: "purpose", purpose: need[0]?.purposeId, section: "data" }, actionable: true };
    }
    case "needs_processors": {
      const need = confirmedPurposes(a).filter((p) => p.processorMode === "unanswered" || (p.processorMode === "uses_processors" && confirmedProcessors(p).length === 0));
      const verb = `Choose processors for ${need.length} purpose${need.length === 1 ? "" : "s"}`;
      return { text: verb, verb, target: { pane: "purpose", purpose: need[0]?.purposeId, section: "processors" }, actionable: true };
    }
    case "needs_review":
      return { text: "Confirm review", verb: "Confirm review", target: { pane: "review" }, actionable: true };
  }
}

// --- Rail text --------------------------------------------------------------

export function basicsRailText(a: Activity, multiEntity: boolean): string {
  const g = basicsGaps(a, multiEntity)[0];
  if (!g) return "Complete";
  return g === "owner" ? "Needs owner" : g === "entity" ? "Needs entity" : "Needs whose data";
}

export function purposeRailText(a: Activity, link: ActivityPurpose, ctx: Ctx): string {
  if (link.state === "suggested") return "Suggested";
  const ps = purposeState(ctx.purposes[link.purposeId]);
  switch (ps.state) {
    case "draft": return "Draft";
    case "waiting_for_dpo": return "Waiting for DPO";
    case "changes_requested": return "Changes requested";
    case "rejected": return "Rejected";
    case "retired": return "Retired";
    default: break; // approved / approved_newer_waiting → fall through to data/processor checks
  }
  if (confirmedData(link).length === 0) return "Needs data";
  if (link.processorMode === "unanswered" || (link.processorMode === "uses_processors" && confirmedProcessors(link).length === 0)) return "Needs processors";
  return "Complete";
}

export function reviewRailText(blockingCount: number): string {
  return blockingCount > 0 ? `Fix ${blockingCount} item${blockingCount === 1 ? "" : "s"}` : "Ready";
}

export function openReasonsCount(a: Activity): number {
  return a.reasons.filter((r) => r.status === "open").length;
}

// --- Summary + list sentence ------------------------------------------------

export function summary(a: Activity): string {
  const confirmed = confirmedPurposes(a);
  const fields = confirmed.reduce((n, p) => n + confirmedData(p).length, 0);
  const vendors = new Set<string>();
  for (const p of confirmed) for (const pl of confirmedProcessors(p)) vendors.add(pl.vendorId);
  return `${confirmed.length} purpose${confirmed.length === 1 ? "" : "s"} · ${fields} field${fields === 1 ? "" : "s"} · ${vendors.size} processor${vendors.size === 1 ? "" : "s"}`;
}

export const NEEDS_WORK_KINDS: CompletenessKind[] = ["needs_basics", "needs_purpose", "needs_approval", "needs_data", "needs_processors"];

export function isNeedsWork(c: Completeness): boolean { return NEEDS_WORK_KINDS.includes(c.kind); }

export function listSentence(activities: Activity[], ctx: Ctx): { sentence: string; gapsLine: string } {
  const comps = activities.map((a) => completeness(a, ctx));
  const ready = comps.filter((c) => c.kind === "complete").length;
  const sentence = `${activities.length} activit${activities.length === 1 ? "y" : "ies"}. ${ready} ${ready === 1 ? "is" : "are"} ready for ROPA.`;

  const tally: Partial<Record<CompletenessKind, number>> = {};
  for (const c of comps) if (isNeedsWork(c)) tally[c.kind] = (tally[c.kind] ?? 0) + 1;
  const needWork = Object.values(tally).reduce((n, v) => n + (v ?? 0), 0);
  if (needWork === 0) return { sentence, gapsLine: "Every activity is ready for ROPA." };

  const phrase: Record<string, string> = {
    needs_basics: "need the basics", needs_purpose: "need a purpose", needs_approval: "wait on a purpose approval",
    needs_data: "need data", needs_processors: "need a processor decision",
  };
  const parts = NEEDS_WORK_KINDS.filter((k) => (tally[k] ?? 0) > 0).map((k) => `${tally[k]} ${phrase[k]}`);
  const shown = parts.slice(0, 3);
  const more = parts.length - shown.length;
  const gapsLine = `${needWork} need work: ${shown.join(", ")}${more > 0 ? `. +${more} more` : ""}.`;
  return { sentence, gapsLine };
}
