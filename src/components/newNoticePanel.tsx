"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { ActionError } from "@/components/actions";
import { createNoticeFullAction } from "@/app/actions/consent";
import { DATA_CATEGORIES, DATA_CATEGORY_LABEL } from "@/lib/domain";
import { NOTICE_TEMPLATES } from "@/lib/notices";
import type { ActionResult } from "@/app/actions/requests";

type Mode = "blank" | "template" | "duplicate" | "import";
const MODES: { key: Mode; label: string }[] = [
  { key: "blank", label: "Blank" },
  { key: "template", label: "Template" },
  { key: "duplicate", label: "Duplicate" },
  { key: "import", label: "Import" },
];

export interface SourceNotice { id: string; name: string; content: string }

/**
 * "+ New notice" opens this slide-in panel. Classification (Fiduciary /
 * Category / Purpose) is captured at creation — never a blank shell filled in
 * later — and the panel sizes itself to the path: compact for Blank/Import,
 * a two-pane list+preview for Template/Duplicate, and Import grows once a file
 * is parsed. Submitting lands directly in Content & Versions of the new draft.
 */
export function NewNoticePanel({
  fiduciaries,
  purposes,
  sources,
}: {
  fiduciaries: { id: string; name: string }[];
  purposes: { id: string; name: string }[];
  sources: SourceNotice[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);

  const [mode, setMode] = useState<Mode>("blank");
  const [name, setName] = useState("");
  const [fid, setFid] = useState("");
  const [cat, setCat] = useState("");
  const [pur, setPur] = useState("");

  const [templateId, setTemplateId] = useState<string | null>(null);
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [sourceSearch, setSourceSearch] = useState("");
  const [importText, setImportText] = useState<string | null>(null);
  const [importName, setImportName] = useState<string | null>(null);

  const twoPane = mode === "template" || mode === "duplicate";

  const filteredSources = useMemo(
    () => sources.filter((s) => s.name.toLowerCase().includes(sourceSearch.toLowerCase())),
    [sources, sourceSearch],
  );
  const selectedTemplate = NOTICE_TEMPLATES.find((t) => t.id === templateId) ?? null;
  const selectedSource = sources.find((s) => s.id === sourceId) ?? null;

  const preview =
    mode === "template" ? selectedTemplate?.content ?? "" :
    mode === "duplicate" ? selectedSource?.content ?? "" :
    mode === "import" ? importText ?? "" : "";

  const reset = () => {
    setMode("blank"); setName(""); setFid(""); setCat(""); setPur("");
    setTemplateId(null); setSourceId(null); setSourceSearch(""); setImportText(null); setImportName(null);
    setResult(null);
  };
  const close = () => { setOpen(false); reset(); };

  const pickTemplate = (id: string) => {
    setTemplateId(id);
    const t = NOTICE_TEMPLATES.find((x) => x.id === id);
    if (t && !cat) setCat(t.suggestedCategory);
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setImportName(file.name);
    try {
      const text = await file.text();
      setImportText(text.slice(0, 20000));
    } catch {
      setImportText("(Could not read this file as text — the notice will start empty.)");
    }
  };

  const canSubmit = Boolean(name.trim() && fid && cat && pur) &&
    (mode !== "duplicate" || Boolean(sourceId)) &&
    (mode !== "template" || Boolean(templateId));

  const submit = () => {
    start(async () => {
      const content =
        mode === "template" ? selectedTemplate?.content :
        mode === "import" ? importText ?? "" :
        mode === "blank" ? "" : undefined; // duplicate copies server-side
      const r = await createNoticeFullAction({
        mode, name, fiduciaryId: fid, dataCategory: cat, purposeTagId: pur,
        content, sourceId: mode === "duplicate" ? sourceId ?? undefined : undefined,
      });
      setResult(r);
      if (r.ok && r.id) { close(); router.push(`/consent/notices/${r.id}?tab=content`); }
    });
  };

  if (!open) {
    return <button className="btn primary sm" onClick={() => setOpen(true)}>+ New notice</button>;
  }

  return (
    <div className="slideover-scrim" onClick={close}>
      <aside className={`slideover${twoPane ? " wide" : ""}`} onClick={(e) => e.stopPropagation()}>
        <header className="slideover-head">
          <h2 style={{ margin: 0, fontSize: 15 }}>New notice</h2>
          <button className="icon-btn" onClick={close} aria-label="Close"><X size={16} /></button>
        </header>

        <div className="slideover-body">
          <div className="section-label" style={{ marginTop: 0 }}>Start with</div>
          <div className="segmented" style={{ marginBottom: 14 }}>
            {MODES.map((m) => (
              <button key={m.key} className={`seg${mode === m.key ? " on" : ""}`} onClick={() => setMode(m.key)}>
                {m.label}
              </button>
            ))}
          </div>

          <div className={twoPane ? "slideover-grid" : ""}>
            {/* Left / source picker for the two-pane modes and import */}
            {mode === "template" && (
              <div className="pick-list">
                {NOTICE_TEMPLATES.map((t) => (
                  <button key={t.id} className={`pick-item${templateId === t.id ? " on" : ""}`} onClick={() => pickTemplate(t.id)}>
                    <span className="cell-primary">{t.name}</span>
                    <span className="cell-sub">{t.description}</span>
                  </button>
                ))}
              </div>
            )}
            {mode === "duplicate" && (
              <div className="pick-list">
                <input className="input sm" placeholder="Search notices…" value={sourceSearch} onChange={(e) => setSourceSearch(e.target.value)} style={{ marginBottom: 6 }} />
                {filteredSources.map((s) => (
                  <button key={s.id} className={`pick-item${sourceId === s.id ? " on" : ""}`} onClick={() => setSourceId(s.id)}>
                    <span className="cell-primary">{s.name}</span>
                  </button>
                ))}
                {filteredSources.length === 0 && <div className="cell-sub" style={{ padding: 8 }}>No matching notices.</div>}
              </div>
            )}

            {/* Right / form + preview */}
            <div className="stack" style={{ gap: 12 }}>
              {mode === "import" && (
                <div className="import-drop">
                  <input type="file" accept=".txt,.md,.html,.htm,.pdf" onChange={(e) => onFile(e.target.files?.[0])} />
                  {importName && (
                    <div className="cell-sub" style={{ marginTop: 8 }}>
                      Detected: <strong>{importName}</strong> · {importText ? `${importText.split(/\s+/).filter(Boolean).length} words` : "parsing…"}
                    </div>
                  )}
                </div>
              )}

              <label className="field">
                <span className="field-label">Title <span className="req">required</span></span>
                <input className="input" placeholder="e.g. Customer Privacy Notice" value={name} onChange={(e) => setName(e.target.value)} />
              </label>
              <div className="form-grid">
                <label className="field">
                  <span className="field-label">Fiduciary <span className="req">required</span></span>
                  <select className="input" value={fid} onChange={(e) => setFid(e.target.value)}>
                    <option value="">Select…</option>
                    {fiduciaries.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                  </select>
                </label>
                <label className="field">
                  <span className="field-label">Data Category <span className="req">required</span></span>
                  <select className="input" value={cat} onChange={(e) => setCat(e.target.value)}>
                    <option value="">Select…</option>
                    {DATA_CATEGORIES.map((c) => <option key={c} value={c}>{DATA_CATEGORY_LABEL[c]}</option>)}
                  </select>
                </label>
                <label className="field">
                  <span className="field-label">Purpose <span className="req">required</span> <span className="lock-mark">🔒 DPO</span></span>
                  <select className="input" value={pur} onChange={(e) => setPur(e.target.value)}>
                    <option value="">Select…</option>
                    {purposes.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </label>
              </div>

              {(twoPane || (mode === "import" && importText)) && (
                <div>
                  <div className="section-label">{mode === "import" ? "Detected content" : "Preview"}</div>
                  <div className="preview-pane">{preview || <span className="cell-sub">Select a source to preview its content.</span>}</div>
                </div>
              )}
            </div>
          </div>

          <ActionError result={result} />
        </div>

        <footer className="slideover-foot">
          <button className="btn ghost" onClick={close}>Cancel</button>
          <button className="btn primary" disabled={pending || !canSubmit} onClick={submit}>
            {pending ? "Creating…" : "Create draft and start writing"}
          </button>
        </footer>
      </aside>
    </div>
  );
}
