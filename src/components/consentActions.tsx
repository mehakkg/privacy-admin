"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createNoticeAction, duplicateNoticeAction } from "@/app/actions/consent";
import { ActionError } from "@/components/actions";
import type { ActionResult } from "@/app/actions/requests";

/**
 * "+ New notice" — start from a template, import an existing policy file, or
 * duplicate an existing notice as a fresh draft.
 */
export function NewNoticeButton({ existing = [] }: { existing?: { id: string; name: string }[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"template" | "import" | "duplicate" | null>(null);
  const [name, setName] = useState("");
  const [sourceId, setSourceId] = useState(existing[0]?.id ?? "");
  const [result, setResult] = useState<ActionResult | null>(null);

  const done = () => { setOpen(false); setMode(null); setName(""); router.refresh(); };

  const create = (origin: "template" | "import") => {
    start(async () => {
      const r = await createNoticeAction(name || (origin === "template" ? "New notice from template" : "Imported policy"), origin);
      setResult(r);
      if (r.ok) done();
    });
  };

  const duplicate = () => {
    start(async () => {
      const r = await duplicateNoticeAction(sourceId, name || undefined);
      setResult(r);
      if (r.ok) done();
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
      <div className="filter-pop" style={{ right: 0, left: "auto", minWidth: 280, padding: 10 }}>
        {!mode ? (
          <div className="stack" style={{ gap: 6 }}>
            <button className="btn sm" onClick={() => setMode("template")}>Start from template</button>
            <button className="btn sm" onClick={() => setMode("import")}>Import existing policy</button>
            <button className="btn sm" disabled={existing.length === 0} onClick={() => setMode("duplicate")}>
              Duplicate from existing
            </button>
            <button className="btn ghost xs" onClick={() => setOpen(false)}>Cancel</button>
          </div>
        ) : mode === "duplicate" ? (
          <div className="stack" style={{ gap: 8 }}>
            <div className="section-label" style={{ margin: 0 }}>Duplicate which notice?</div>
            <select className="input" value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
              {existing.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
            </select>
            <input className="input" placeholder="New name (optional)" value={name} onChange={(e) => setName(e.target.value)} />
            <div className="row" style={{ gap: 6 }}>
              <button className="btn primary sm" disabled={pending || !sourceId} onClick={duplicate}>
                {pending ? "Duplicating…" : "Create copy"}
              </button>
              <button className="btn ghost sm" onClick={() => setMode(null)}>Back</button>
            </div>
            <ActionError result={result} />
          </div>
        ) : (
          <div className="stack" style={{ gap: 8 }}>
            <div className="section-label" style={{ margin: 0 }}>
              {mode === "template" ? "New notice name" : "Imported notice name"}
            </div>
            <input className="input" placeholder="e.g. Customer Privacy Notice" value={name} onChange={(e) => setName(e.target.value)} />
            {mode === "import" && <input type="file" accept=".txt,.md,.html,.pdf" className="cell-sub" />}
            <div className="row" style={{ gap: 6 }}>
              <button className="btn primary sm" disabled={pending} onClick={() => create(mode)}>
                {pending ? "Creating…" : "Create draft"}
              </button>
              <button className="btn ghost sm" onClick={() => setMode(null)}>Back</button>
            </div>
            <ActionError result={result} />
          </div>
        )}
      </div>
    </div>
  );
}
