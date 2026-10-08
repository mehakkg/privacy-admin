"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { FlaskConical } from "lucide-react";
import { switchRole } from "@/app/actions/session";
import { setPaConfigAction } from "@/app/actions/paConfig";
import { simulateReviewEventAction } from "@/app/actions/activityReview";
import { simulateAnotherEditorAction } from "@/app/actions/activities";
import type { ActorRole } from "@/lib/domain";

const SIM: { type: "new_field_in_linked_table" | "reclassified_field" | "vendor_changed" | "review_due"; label: string; detail: string }[] = [
  { type: "new_field_in_linked_table", label: "New field", detail: "A new field appeared in a linked system." },
  { type: "reclassified_field", label: "Reclassified", detail: "A linked field was reclassified." },
  { type: "vendor_changed", label: "Vendor changed", detail: "A linked vendor's contract changed." },
  { type: "review_due", label: "Review due", detail: "Review is due for this activity." },
];

/** DEV-ONLY controls, rendered only with ?dev=1. Not a product feature. */
export function DevBar({ role, multiEntity, requireDpoReview, activityId }: { role: string; multiEntity: boolean; requireDpoReview: boolean; activityId?: string }) {
  const router = useRouter();
  const [, start] = useTransition();
  const run = (fn: () => Promise<unknown>) => start(async () => { await fn(); router.refresh(); });
  return (
    <div className="pa-devbar">
      <span className="row" style={{ gap: 6, alignItems: "center", fontWeight: 600 }}><FlaskConical size={13} /> Dev</span>
      <label>Acting as
        <select className="input sm" value={role} onChange={(e) => run(() => switchRole(e.target.value as ActorRole))}>
          <option value="admin">R. Iyer (Admin)</option><option value="dpo">K. Menon (DPO)</option>
        </select>
      </label>
      <label>Entities
        <select className="input sm" value={multiEntity ? "two" : "one"} onChange={(e) => run(() => setPaConfigAction({ multiEntity: e.target.value === "two" }))}>
          <option value="one">One</option><option value="two">Two</option>
        </select>
      </label>
      <label>DPO review of activities
        <select className="input sm" value={requireDpoReview ? "on" : "off"} onChange={(e) => run(() => setPaConfigAction({ requireDpoReview: e.target.value === "on" }))}>
          <option value="off">Off</option><option value="on">On</option>
        </select>
      </label>
      {activityId && (
        <label>Simulate event
          <select className="input sm" value="" onChange={(e) => { const s = SIM.find((x) => x.type === e.target.value); if (s) run(() => simulateReviewEventAction(activityId, s.type, s.detail)); }}>
            <option value="">Choose…</option>{SIM.map((s) => <option key={s.type} value={s.type}>{s.label}</option>)}
          </select>
        </label>
      )}
      {activityId && (
        <label>Simulate another editor
          <select className="input sm" value="" onChange={(e) => { if (e.target.value) run(() => simulateAnotherEditorAction(activityId, e.target.value)); }}>
            <option value="">Choose a field…</option>
            <option value="ownerName">Owner</option>
            <option value="department">Department</option>
          </select>
        </label>
      )}
    </div>
  );
}
