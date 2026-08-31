import {
  DPRR_FULFILMENT_PERIOD,
  ERASURE_PRE_NOTICE,
  GRIEVANCE_REDRESSAL_CEILING,
  hoursToMs,
  type DurationConstant,
} from "@/lib/dpdp/statute";

/**
 * SLA / DEADLINE ENGINE
 *
 * Every deadline in the product is computed here from the constants in
 * dpdp/statute.ts. No screen contains a number of hours or days.
 *
 * The engine distinguishes two different clocks, because conflating them is a
 * compliance error rather than a display quirk:
 *
 *   - the FULFILMENT deadline, which is organisational policy bounded by the
 *     90-day statutory grievance ceiling; and
 *   - the 48-hour PRE-ERASURE NOTICE gate (Rules 2025 Rule 8), which must
 *     elapse *before* erasure and is therefore a precondition, not a target.
 *
 * A countdown derived from org policy is labelled as such wherever it renders,
 * so nobody reads an internal target as a statutory obligation.
 */

export type SlaBand = "ok" | "due_soon" | "breached";

/** Inside this window a request is flagged as due soon. */
const DUE_SOON_HOURS = 72;

export interface SlaState {
  deadline: Date;
  msRemaining: number;
  hoursRemaining: number;
  daysRemaining: number;
  band: SlaBand;
  /** True when the STATUTORY 90-day ceiling has been passed, not merely the org target. */
  statutoryCeilingBreached: boolean;
  ceilingAt: Date;
  basis: DurationConstant;
  label: string;
}

export function computeFulfilmentDeadline(receivedAt: Date): Date {
  return new Date(receivedAt.getTime() + hoursToMs(DPRR_FULFILMENT_PERIOD.hours));
}

export function computeStatutoryCeiling(receivedAt: Date): Date {
  return new Date(
    receivedAt.getTime() + hoursToMs(GRIEVANCE_REDRESSAL_CEILING.hours),
  );
}

/** DPDP Rules 2025 Rule 8: erasure may not occur until this moment has passed. */
export function computePreNoticeDue(noticeSentAt: Date): Date {
  return new Date(noticeSentAt.getTime() + hoursToMs(ERASURE_PRE_NOTICE.hours));
}

export function evaluateSla(
  receivedAt: Date,
  deadline: Date,
  now: Date = new Date(),
): SlaState {
  const msRemaining = deadline.getTime() - now.getTime();
  const hoursRemaining = msRemaining / (60 * 60 * 1000);
  const ceilingAt = computeStatutoryCeiling(receivedAt);

  const band: SlaBand =
    msRemaining <= 0 ? "breached" : hoursRemaining <= DUE_SOON_HOURS ? "due_soon" : "ok";

  return {
    deadline,
    msRemaining,
    hoursRemaining,
    daysRemaining: hoursRemaining / 24,
    band,
    statutoryCeilingBreached: now.getTime() > ceilingAt.getTime(),
    ceilingAt,
    basis: DPRR_FULFILMENT_PERIOD,
    label: formatRemaining(msRemaining),
  };
}

export interface PreNoticeState {
  /** Has the 48h notice been sent at all? */
  sent: boolean;
  sentAt: Date | null;
  /** The moment erasure becomes permissible. */
  clearsAt: Date | null;
  /** True once the 48 hours have elapsed. */
  cleared: boolean;
  hoursRemaining: number;
  basis: DurationConstant;
}

export function evaluatePreNotice(
  sentAt: Date | null,
  dueAt: Date | null,
  now: Date = new Date(),
): PreNoticeState {
  const clearsAt = dueAt ?? (sentAt ? computePreNoticeDue(sentAt) : null);
  const cleared = clearsAt ? now.getTime() >= clearsAt.getTime() : false;

  return {
    sent: Boolean(sentAt),
    sentAt,
    clearsAt,
    cleared,
    hoursRemaining: clearsAt
      ? Math.max(0, (clearsAt.getTime() - now.getTime()) / (60 * 60 * 1000))
      : ERASURE_PRE_NOTICE.hours,
    basis: ERASURE_PRE_NOTICE,
  };
}

export function formatRemaining(ms: number): string {
  const overdue = ms < 0;
  const abs = Math.abs(ms);
  const days = Math.floor(abs / (24 * 60 * 60 * 1000));
  const hours = Math.floor((abs % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));

  const magnitude = days > 0 ? `${days}d ${hours}h` : `${hours}h`;
  return overdue ? `${magnitude} overdue` : `${magnitude} left`;
}

/** Queue ordering: breached first, then soonest deadline. */
export function slaSortValue(state: SlaState): number {
  return state.msRemaining;
}
