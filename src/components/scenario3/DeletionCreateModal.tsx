"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Modal } from "@/components/Modal";
import { ActionError } from "@/components/actions";
import { createDeletionInstructionAction } from "@/app/actions/scenario3";
import type { ActionResult } from "@/app/actions/requests";

/** Manual creation of a DeletionInstruction (the shared interface a future DSR
 *  module writes into via POST /api/deletion-instructions). Creating it runs the
 *  retention-conflict check immediately. */
export function DeletionCreateModal({ principals }: { principals: { id: string; label: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const [f, setF] = useState({ customerId: "", scope: "", deadline: "", source: "manual" });

  const submit = () =>
    start(async () => {
      const r = await createDeletionInstructionAction({ ...f });
      setResult(r);
      if (r.ok) { setOpen(false); setF({ customerId: "", scope: "", deadline: "", source: "manual" }); router.refresh(); }
    });

  return (
    <>
      <button className="btn primary sm" onClick={() => setOpen(true)}><Plus size={14} /> New deletion instruction</button>
      {open && (
        <Modal title="New deletion instruction" subtitle="The retention-conflict check runs the moment it is created." onClose={() => setOpen(false)}
          footer={<><button className="btn" onClick={() => setOpen(false)}>Cancel</button><button className="btn primary" disabled={pending || !f.customerId || !f.scope.trim()} onClick={submit}>Create &amp; check</button></>}>
          <ActionError result={result} />
          <label className="fld"><span>Customer</span>
            <select className="input" value={f.customerId} onChange={(e) => setF({ ...f, customerId: e.target.value })}>
              <option value="">Select a Data Principal…</option>
              {principals.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </label>
          <label className="fld"><span>Scope</span><input className="input" placeholder="e.g. All personal data, or Marketing profile only" value={f.scope} onChange={(e) => setF({ ...f, scope: e.target.value })} /></label>
          <div className="row" style={{ gap: 10 }}>
            <label className="fld" style={{ flex: 1 }}><span>Deadline (optional)</span><input type="date" className="input" value={f.deadline} onChange={(e) => setF({ ...f, deadline: e.target.value })} /></label>
            <label className="fld" style={{ flex: 1 }}><span>Source</span><input className="input" value={f.source} onChange={(e) => setF({ ...f, source: e.target.value })} /></label>
          </div>
        </Modal>
      )}
    </>
  );
}
