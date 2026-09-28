"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ShieldCheck, Lock, LockOpen, Unlock, Pencil } from "lucide-react";
import { Pill } from "@/components/ui";
import { unlockRuleAction, type MaskingActionResult } from "@/app/actions/masking";

/**
 * SCREEN 2 — two structurally different locks, two deliberately different visuals.
 *
 * A system-regulated field (SUPER_ADMIN, permanent) renders with NO interactive
 * element beneath it — the absence of an affordance is the point. A tenant's own
 * self-locked field renders a reachable Unlock. They must never share a treatment,
 * because one is a legal floor and the other is a reversible team choice.
 */
export function LockTreatment({
  ruleId,
  lockType,
  regulated,
  editable,
  lockedBy,
  lockedAt,
  statutoryCitation,
}: {
  ruleId: string;
  lockType: string;
  regulated: boolean;
  editable: boolean;
  lockedBy: string | null;
  lockedAt: string | null;
  statutoryCitation: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<MaskingActionResult | null>(null);

  const unlock = () =>
    start(async () => {
      const r = await unlockRuleAction(ruleId);
      setResult(r);
      if (r.ok) router.refresh();
    });

  if (lockType === "system_regulated") {
    return (
      <div className="lock-box system">
        <div className="row" style={{ gap: 8, alignItems: "center" }}>
          <ShieldCheck size={18} className="lock-icon-system" />
          <Pill tone="red" dot={false}>System-regulated · permanent</Pill>
        </div>
        <p className="cell-sub" style={{ margin: "8px 0 0" }}>
          Owned by SUPER_ADMIN. No tenant, including yours, can edit, override, or unlock this.
        </p>
        {statutoryCitation && (
          <p className="cell-sub" style={{ margin: "4px 0 0", color: "var(--blue)" }}>{statutoryCitation}</p>
        )}
        {/* Deliberately no action element here. */}
      </div>
    );
  }

  if (lockType === "self_locked") {
    return (
      <div className="lock-box self">
        <div className="row" style={{ gap: 8, alignItems: "center" }}>
          <Lock size={18} className="lock-icon-self" />
          <Pill tone="yellow" dot={false}>Self-locked · reversible</Pill>
        </div>
        <p className="cell-sub" style={{ margin: "8px 0 0" }}>
          Locked by {lockedBy ?? "your team"}{lockedAt ? ` on ${lockedAt}` : ""}. You can unlock this anytime.
        </p>
        {result && !result.ok && (
          <div className="notice danger" style={{ marginTop: 8 }}>
            <div className="notice-title">Refused — {result.errorKind}</div>
            <div>{result.error}</div>
          </div>
        )}
        <button className="btn sm" style={{ marginTop: 10 }} disabled={pending} onClick={unlock}>
          <Unlock size={13} /> {pending ? "Unlocking…" : "Unlock this field"}
        </button>
      </div>
    );
  }

  // lockType === "none": freely editable (including a just-unlocked field).
  return (
    <div className="lock-box open">
      <div className="row" style={{ gap: 8, alignItems: "center" }}>
        <LockOpen size={18} className="muted" />
        <Pill tone="green" dot={false}>Unlocked · editable</Pill>
        {regulated && <Pill tone="yellow" dot={false}>regulated</Pill>}
      </div>
      <p className="cell-sub" style={{ margin: "8px 0 0" }}>
        Exact-match enforcement is not locked on this field. It can be edited freely.
      </p>
      {editable && (
        <Link href={`/masking/rules/${ruleId}/edit`} className="btn sm" style={{ marginTop: 10 }}>
          <Pencil size={13} /> Edit rule
        </Link>
      )}
    </div>
  );
}
