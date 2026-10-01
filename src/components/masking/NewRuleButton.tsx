"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { CreateRuleModal, type CatalogField } from "@/components/masking/CreateRuleModal";

/** "+ New rule" in the Rules card header — opens the stepper with an empty picker. */
export function NewRuleButton({ catalog }: { catalog: CatalogField[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="btn primary sm" onClick={() => setOpen(true)}><Plus size={14} /> New rule</button>
      {open && <CreateRuleModal catalog={catalog} initialSelected={[]} onClose={() => setOpen(false)} />}
    </>
  );
}
