"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ShieldCheck, UserCog } from "lucide-react";
import { ActionError } from "@/components/actions";
import { setGovernanceStructureAction } from "@/app/actions/org";
import type { ActionResult } from "@/app/actions/requests";

/**
 * Organization setup — the one-time (editable) governance-structure question.
 * "No dedicated DPO" routes approvals back to the same person in a DPO capacity,
 * recorded as self-approved; it never removes the approval step.
 */
export function OrganizationSetup({ structure }: { structure: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const combined = structure === "combined_admin_dpo";

  const set = (s: string) => start(async () => {
    const r = await setGovernanceStructureAction(s);
    setResult(r);
    if (r.ok) router.refresh();
  });

  return (
    <div className="stack" style={{ gap: 16, maxWidth: 720 }}>
      <div>
        <h3 style={{ margin: "0 0 4px" }}>Does your organization have a dedicated Data Protection Officer?</h3>
        <p className="cell-sub" style={{ margin: 0 }}>This sets how approval requests route. It never removes the approval step — it only decides who reviews.</p>
      </div>

      <div className="gov-choices">
        <button className={`gov-choice${!combined ? " on" : ""}`} disabled={pending} onClick={() => set("dedicated_dpo")}>
          <span className="gov-choice-head"><ShieldCheck size={18} /> Yes — dedicated DPO {!combined && <Check size={15} className="gov-check" />}</span>
          <span className="cell-sub">Approval requests route to your DPO&rsquo;s queue. A separate person reviews and ratifies Admin&rsquo;s requests.</span>
        </button>
        <button className={`gov-choice${combined ? " on" : ""}`} disabled={pending} onClick={() => set("combined_admin_dpo")}>
          <span className="gov-choice-head"><UserCog size={18} /> No — combined Admin + DPO {combined && <Check size={15} className="gov-check" />}</span>
          <span className="cell-sub">One person holds both roles. Requests still go through the queue, reviewed by you in a DPO capacity.</span>
        </button>
      </div>

      {combined && (
        <div className="notice info">
          <div className="notice-title">Combined Admin + DPO governance</div>
          <div>Approval requests will route back to you, in a DPO capacity, and will be marked as <strong>self-approved</strong> in the audit trail. You can update this once you designate a dedicated DPO. Records already approved keep their historical marker — switching later never rewrites the past.</div>
        </div>
      )}

      <p className="cell-sub" style={{ margin: 0 }}>
        Current structure: <strong>{combined ? "Combined Admin + DPO" : "Dedicated DPO"}</strong>. Editable at any time; changing it only affects how new requests route.
      </p>
      <ActionError result={result} />
    </div>
  );
}
