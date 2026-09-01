"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createNoticeAction } from "@/app/actions/consent";
import { ActionError } from "@/components/actions";
import type { ActionResult } from "@/app/actions/requests";

/**
 * "+ New notice" — two inline options, not a wizard: start from a template, or
 * import an existing policy file as a new draft.
 */
export function NewNoticeButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"template" | "import" | null>(null);
  const [name, setName] = useState("");
  const [result, setResult] = useState<ActionResult | null>(null);

  const create = (origin: "template" | "import") => {
    start(async () => {
      const r = await createNoticeAction(name || (origin === "template" ? "New notice from template" : "Imported policy"), origin);
      setResult(r);
      if (r.ok) {
        setOpen(false);
        setMode(null);
        setName("");
        router.refresh();
      }
    });
  };

  if (!open) {
    return (
      <button className="btn primary sm" onClick={() => setOpen(true)}>
        + New notice
      </button>
    );
  }

  return (
    <div style={{ position: "relative" }}>
      <div className="filter-pop" style={{ right: 0, left: "auto", minWidth: 260, padding: 10 }}>
        {!mode ? (
          <div className="stack" style={{ gap: 6 }}>
            <button className="btn sm" onClick={() => setMode("template")}>
              Start from template
            </button>
            <button className="btn sm" onClick={() => setMode("import")}>
              Import existing policy
            </button>
            <button className="btn ghost xs" onClick={() => setOpen(false)}>
              Cancel
            </button>
          </div>
        ) : (
          <div className="stack" style={{ gap: 8 }}>
            <div className="section-label" style={{ margin: 0 }}>
              {mode === "template" ? "New notice name" : "Imported notice name"}
            </div>
            <input
              className="input"
              placeholder="e.g. Customer Privacy Notice"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            {mode === "import" && (
              <input type="file" accept=".txt,.md,.html,.pdf" className="cell-sub" />
            )}
            <div className="row" style={{ gap: 6 }}>
              <button className="btn primary sm" disabled={pending} onClick={() => create(mode)}>
                {pending ? "Creating…" : "Create draft"}
              </button>
              <button className="btn ghost sm" onClick={() => setMode(null)}>
                Back
              </button>
            </div>
            <ActionError result={result} />
          </div>
        )}
      </div>
    </div>
  );
}
