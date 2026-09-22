"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Modal } from "@/components/Modal";
import { ActionError } from "@/components/actions";
import { createFulfillmentRequestAction } from "@/app/actions/fulfillment";
import type { ActionResult } from "@/app/actions/requests";

/** Manual intake — for a validated erasure that arrives outside the Grievance
 *  intake interface (POST /api/fulfillment-requests). Creates the request and
 *  its shared DeletionInstruction, running the retention check. */
export function FulfillmentIntakeModal({ principals }: { principals: { id: string; label: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const [f, setF] = useState({ customerId: "", scope: "", deadline: "" });

  const submit = () => start(async () => {
    const r = await createFulfillmentRequestAction({ ...f });
    setResult(r);
    if (r.ok) { setOpen(false); setF({ customerId: "", scope: "", deadline: "" }); router.refresh(); }
  });

  return (
    <>
      <button className="btn primary sm" onClick={() => setOpen(true)}><Plus size={14} /> New deletion request</button>
      {open && (
        <Modal title="New deletion request" subtitle="Creates the request and its shared DeletionInstruction; the retention check runs immediately." onClose={() => setOpen(false)}
          footer={<><button className="btn" onClick={() => setOpen(false)}>Cancel</button><button className="btn primary" disabled={pending || !f.customerId || !f.scope.trim()} onClick={submit}>Create request</button></>}>
          <ActionError result={result} />
          <label className="fld"><span>Customer</span>
            <select className="input" value={f.customerId} onChange={(e) => setF({ ...f, customerId: e.target.value })}>
              <option value="">Select a Data Principal…</option>
              {principals.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </label>
          <label className="fld"><span>Scope</span><input className="input" placeholder="e.g. All personal data, or Marketing profile only" value={f.scope} onChange={(e) => setF({ ...f, scope: e.target.value })} /></label>
          <label className="fld"><span>Deadline (optional)</span><input type="date" className="input" value={f.deadline} onChange={(e) => setF({ ...f, deadline: e.target.value })} /></label>
        </Modal>
      )}
    </>
  );
}
