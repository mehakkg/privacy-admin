"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Modal } from "@/components/Modal";
import { ActionError } from "@/components/actions";
import { createEvidenceRequestAction } from "@/app/actions/scenario3";
import type { ActionResult } from "@/app/actions/requests";

/** Manual intake — for an evidence request that arrives outside the Grievance
 *  intake interface. (The interface itself is POST /api/evidence-requests.) */
export function EvidenceIntakeModal() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const [f, setF] = useState({ requestedBy: "", customerId: "", claimedEvent: "", dateFrom: "", dateTo: "", eventTypeHint: "" });

  const submit = () =>
    start(async () => {
      const r = await createEvidenceRequestAction({ ...f });
      setResult(r);
      if (r.ok) { setOpen(false); setF({ requestedBy: "", customerId: "", claimedEvent: "", dateFrom: "", dateTo: "", eventTypeHint: "" }); router.refresh(); }
    });

  return (
    <>
      <button className="btn primary sm" onClick={() => setOpen(true)}><Plus size={14} /> Log request manually</button>
      {open && (
        <Modal title="Log an evidence request" subtitle="For a Grievance Officer request received outside the intake interface." onClose={() => setOpen(false)}
          footer={<><button className="btn" onClick={() => setOpen(false)}>Cancel</button><button className="btn primary" disabled={pending || !f.customerId.trim() || !f.claimedEvent.trim()} onClick={submit}>Create request</button></>}>
          <ActionError result={result} />
          <label className="fld"><span>Requested by</span><input className="input" placeholder="Grievance Officer name" value={f.requestedBy} onChange={(e) => setF({ ...f, requestedBy: e.target.value })} /></label>
          <label className="fld"><span>Customer id</span><input className="input" placeholder="e.g. a Data Principal id or reference" value={f.customerId} onChange={(e) => setF({ ...f, customerId: e.target.value })} /></label>
          <label className="fld"><span>Claimed event</span><textarea className="input" rows={2} placeholder="What the Data Principal says happened" value={f.claimedEvent} onChange={(e) => setF({ ...f, claimedEvent: e.target.value })} /></label>
          <div className="row" style={{ gap: 10 }}>
            <label className="fld" style={{ flex: 1 }}><span>From</span><input type="date" className="input" value={f.dateFrom} onChange={(e) => setF({ ...f, dateFrom: e.target.value })} /></label>
            <label className="fld" style={{ flex: 1 }}><span>To</span><input type="date" className="input" value={f.dateTo} onChange={(e) => setF({ ...f, dateTo: e.target.value })} /></label>
          </div>
          <label className="fld"><span>Event-type hint (optional)</span><input className="input" placeholder="e.g. consent, deletion — highlights, never filters" value={f.eventTypeHint} onChange={(e) => setF({ ...f, eventTypeHint: e.target.value })} /></label>
        </Modal>
      )}
    </>
  );
}
