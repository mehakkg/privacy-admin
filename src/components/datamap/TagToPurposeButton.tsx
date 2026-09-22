"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Tag } from "lucide-react";
import { Modal } from "@/components/Modal";
import { ActionError } from "@/components/actions";
import { PurposeSelector, type PurposeChoice, purposeChoiceValid } from "@/components/access/purposeSelector";
import { tagFieldsToPurposeAction } from "@/app/actions/scenario6";
import type { PurposeTagInput } from "@/lib/engines/scenario6";
import type { Opt } from "@/components/datamap/CategoriesManager";
import type { ActionResult } from "@/app/actions/requests";

/** SCREEN 1 (single field) — "Tag to purpose" row action on the Data Field
 *  Inventory, reusing the Purpose selector. */
export function TagToPurposeButton({ fieldId, fieldPath, purposes, processors }: { fieldId: string; fieldPath: string; purposes: Opt[]; processors: Opt[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const [choice, setChoice] = useState<PurposeChoice>({ mode: "none" });

  const submit = () => {
    const inp: PurposeTagInput | null = choice.mode === "existing" ? (choice.existingPurposeTagId ? { mode: "existing", existingPurposeTagId: choice.existingPurposeTagId } : null)
      : choice.mode === "propose" ? { mode: "propose", proposed: { name: choice.proposed.name, description: choice.proposed.description, legalBasis: choice.proposed.legalBasis, retention: choice.proposed.retention } } : null;
    if (!inp) return;
    start(async () => { const r = await tagFieldsToPurposeAction([fieldId], inp); setResult(r); if (r.ok) { setOpen(false); setChoice({ mode: "none" }); router.refresh(); } });
  };

  return (
    <>
      <button className="btn ghost xs" onClick={() => setOpen(true)}><Tag size={11} /> Tag</button>
      {open && (
        <Modal title="Tag to purpose" subtitle={fieldPath} size="md" onClose={() => setOpen(false)}
          footer={<><button className="btn" onClick={() => setOpen(false)}>Cancel</button><button className="btn primary" disabled={pending || !purposeChoiceValid(choice) || choice.mode === "none"} onClick={submit}>Tag field</button></>}>
          <ActionError result={result} />
          <PurposeSelector value={choice} onChange={setChoice} purposes={purposes} processors={processors} allowNone={false} />
        </Modal>
      )}
    </>
  );
}
