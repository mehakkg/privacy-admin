"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { X, LayoutTemplate, PenLine, FilePlus2, Search, Check } from "lucide-react";
import { getComposerDataAction, createActivityFromComposerAction, type ComposerInput } from "@/app/actions/activities";
import type { ComposerData, ComposerPurpose } from "@/lib/engines/composer";
import { PurposeDrawer } from "./PurposeDrawer";

type Start = "template" | "describe" | "blank";
const LAST_KEY = "composer.lastStart";

/**
 * Activity composer (Master spec Part M). A 720px right sheet: a Start screen
 * (template / describe / blank) then one composer — a plain-language sentence of
 * tokens (Who/What/How/Why/Where/Whom) with a live summary beside it. Pre-filled
 * starts reach "Ready to submit" fast; nothing is invented (M8).
 */
export function ActivityComposer({ onClose, onCreated, sourceLine, pending: pendingSuggestions = 0 }: {
  onClose: () => void;
  onCreated: (id: string, submitted: boolean) => void;
  sourceLine?: string;
  pending?: number;
}) {
  const [data, setData] = useState<ComposerData | null>(null);
  const [step, setStep] = useState<"start" | "compose">(sourceLine ? "compose" : "start");
  useEffect(() => { getComposerDataAction().then(setData); }, []);

  // --- selections ---
  const [name, setName] = useState("");
  const [owner, setOwner] = useState("");
  const [entityId, setEntityId] = useState("");
  const [who, setWho] = useState<string[]>([]);
  const [what, setWhat] = useState<string[]>([]);
  const [manual, setManual] = useState<string[]>([]);
  const [how, setHow] = useState<string | null>(null);
  const [why, setWhy] = useState<string[]>([]);
  const [where, setWhere] = useState<string[]>([]);
  const [whom, setWhom] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [dupDismissed, setDupDismissed] = useState(false);
  const [newPurpose, setNewPurpose] = useState<string | null>(null);
  const [pending, startTx] = useTransition();

  useEffect(() => { if (data && !owner) setOwner(data.currentUser); }, [data, owner]);

  const dept = useMemo(() => data?.owners.find((o) => o.name === owner)?.department ?? null, [data, owner]);
  const purposeById = useMemo(() => new Map((data?.purposes ?? []).map((p) => [p.id, p])), [data]);

  // Auto-suggest a name: {Purpose} – {Principal}, until edited.
  const [nameEdited, setNameEdited] = useState(false);
  useEffect(() => {
    if (nameEdited || !data) return;
    const p = why[0] ? purposeById.get(why[0])?.name : null;
    const w = who[0] ? data.principals.find((x) => x.id === who[0])?.label : null;
    if (p && w) setName(`${p} – ${w}`); else if (p) setName(p);
  }, [why, who, data, nameEdited, purposeById]);

  // --- progress (the six checks, lightweight client version of readiness) ---
  const chosenPurposes = why.map((id) => purposeById.get(id)).filter(Boolean) as ComposerPurpose[];
  const purposesOk = chosenPurposes.length > 0 && chosenPurposes.every((p) => p.approval === "approved" || p.approval === "draft");
  const checks = [
    { key: "basics", label: "Basics", pass: !!owner && who.length > 0 && why.length > 0 },
    { key: "data", label: "Data", pass: what.length + manual.length > 0 },
    { key: "systems", label: "Systems", pass: where.length > 0 },
    { key: "purposes", label: "Purposes", pass: purposesOk },
    { key: "dpo", label: "DPO", pass: false },
    { key: "notice", label: "Notice", pass: false },
  ];
  const nextUnmet = checks.find((c) => !c.pass);
  const canSubmit = checks.slice(0, 4).every((c) => c.pass);
  const draftCount = chosenPurposes.filter((p) => p.approval === "draft").length;
  const submitLabel = draftCount > 0 ? `Submit with ${draftCount} new purpose${draftCount === 1 ? "" : "s"}` : "Submit for DPO review";

  // --- duplicate check: ≥60% field overlap with a same-principal activity ---
  const dup = useMemo(() => {
    if (!data || what.length === 0 || dupDismissed) return null;
    const mine = new Set(what);
    for (const a of data.existing) {
      if (!a.principals.some((p) => who.includes(p))) continue;
      const overlap = a.fieldIds.filter((f) => mine.has(f)).length;
      if (a.fieldIds.length && overlap / Math.max(mine.size, a.fieldIds.length) >= 0.6) return { ...a, overlap };
    }
    return null;
  }, [data, what, who, dupDismissed]);

  // --- consequences ---
  const consequences: string[] = [];
  if (draftCount > 0) consequences.push(`Goes to Kavita Menon with ${draftCount} new purpose${draftCount === 1 ? "" : "s"}.`);
  if (chosenPurposes.some((p) => p.legalBasis === "consent" && !p.inNotice)) consequences.push("Needs a notice before collection starts.");
  for (const vid of [...where, ...whom]) { const s = [...(data?.systems ?? []), ...(data?.recipients ?? [])].find((x) => x.id === vid); if (s && s.country !== "India" && s.country !== "—") consequences.push(`${s.name} stores data in ${s.country}.`); }

  const create = (submit: boolean) => {
    if (name.trim().length < 3) { setErr("Give it a name of 3 to 80 characters."); return; }
    if (data?.multiEntity && !entityId) { setErr("Choose a fiduciary."); return; }
    const input: ComposerInput = { name, ownerName: owner, department: dept, entityId: entityId || undefined, principalIds: who, purposeIds: why, fieldIds: what, manualFields: manual, vendorIds: [...where, ...whom], submit };
    startTx(async () => { const r = await createActivityFromComposerAction(input); if (r.ok && r.id) onCreated(r.id, submit); else setErr(r.error ?? "Couldn’t create."); });
  };

  const applyTemplate = (t: ComposerData["templates"][number]) => {
    if (!data) return;
    setName(t.name); setNameEdited(true);
    // Match template data types against DLP inventory fields.
    const matched = data.fields.filter((f) => t.fieldTypes.some((ty) => f.path.toLowerCase().includes(ty.toLowerCase()) || ty.toLowerCase().includes(f.path.toLowerCase())));
    setWhat(matched.map((f) => f.id));
    const ap = data.purposes.find((p) => p.name.toLowerCase() === t.name.toLowerCase() && p.approval === "approved");
    if (ap) setWhy([ap.id]);
    setStep("compose");
  };

  const parseDescribe = (text: string) => {
    if (!data) return;
    const lc = text.toLowerCase();
    const has = (s: string) => lc.includes(s.toLowerCase());
    setWho(data.principals.filter((p) => has(p.label) || has(p.label.replace(/s$/, ""))).map((p) => p.id));
    setWhat(data.fields.filter((f) => has(f.path) || has(f.path.replace(/_/g, " "))).map((f) => f.id));
    const ch = data.channels.find((c) => has(c)); setHow(ch ?? null);
    setWhy(data.purposes.filter((p) => has(p.name)).map((p) => p.id));
    setWhere(data.systems.filter((s) => has(s.name)).map((s) => s.id));
    setWhom(data.recipients.filter((s) => has(s.name)).map((s) => s.id));
    setStep("compose");
  };

  return createPortal(
    <div className="modal-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onKeyDown={(e) => { if (e.key === "Escape") onClose(); if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && step === "compose") create(canSubmit); }}>
      <div className="mp-drawer" role="dialog" aria-modal="true" aria-label="Add activity" style={{ width: 720, maxWidth: "96vw" }}>
        <div className="mp-drawer-head"><strong>{step === "start" ? "Add an activity" : "New activity"}</strong><button className="icon-btn" onClick={onClose}><X size={16} /></button></div>

        {!data ? <div className="mp-drawer-body"><span className="cell-sub">Loading…</span></div>
          : step === "start" ? <StartScreen data={data} pending={pendingSuggestions} onTemplate={applyTemplate} onDescribe={parseDescribe} onBlank={() => setStep("compose")} />
          : (
          <div className="row" style={{ alignItems: "stretch", gap: 0, flex: 1, minHeight: 0 }}>
            <div className="mp-drawer-body stack" style={{ gap: 12, overflow: "auto", padding: 16, flex: "1 1 440px", minWidth: 0 }}>
              {sourceLine && <div className="notice info" style={{ margin: 0 }}>{sourceLine}</div>}
              <label className="fld"><span>Name</span><input className="input" value={name} maxLength={80} onChange={(e) => { setName(e.target.value); setNameEdited(true); setErr(null); }} placeholder="e.g. Retail loan origination" /></label>
              <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
                <label className="fld" style={{ flex: "1 1 180px" }}><span>Owner</span><select className="input" value={owner} onChange={(e) => setOwner(e.target.value)}><option value="">Choose…</option>{data.owners.map((o) => <option key={o.name} value={o.name}>{o.name} — {o.department}</option>)}</select></label>
                {data.multiEntity && <label className="fld" style={{ flex: "1 1 180px" }}><span>Fiduciary</span><select className="input" value={entityId} onChange={(e) => setEntityId(e.target.value)}><option value="">Choose…</option>{data.entities.map((en) => <option key={en.id} value={en.id}>{en.name}</option>)}</select></label>}
              </div>

              <div className="composer-sentence stack" style={{ gap: 10, borderTop: "1px solid var(--border-soft)", paddingTop: 12 }}>
                <Token label="Who" verb="shares" options={data.principals.map((p) => ({ id: p.id, label: p.label }))} selected={who} onChange={setWho} create="principal" />
                <Token label="What" verb="through" hideVerb options={data.fields.map((f) => ({ id: f.id, label: f.path, sub: `${f.system} · ${f.sensitivity}` }))} selected={what} onChange={setWhat} rankSystem={where.map((id) => data.systems.find((s) => s.id === id)?.name).filter(Boolean) as string[]} manual={manual} onManual={setManual} create="field" />
                <SingleToken label="How" options={data.channels} selected={how} onChange={setHow} hint="Add new channels in Consent collection" />
                <Token label="Why" verb="so that we can" options={data.purposes.map((p) => ({ id: p.id, label: p.name, tag: p.approval !== "approved" ? p.approval : undefined }))} selected={why} onChange={setWhy} create="purpose" onCreate={(text) => setNewPurpose(text)} />
                <Token label="Where" verb="stored in" options={data.systems.map((s) => ({ id: s.id, label: s.name, sub: `${s.kindLabel} · ${s.country}`, warn: s.contract !== "on_file" ? "No valid contract (Section 8(2))" : undefined }))} selected={where} onChange={setWhere} hint="Add systems in Settings › Integrations" />
                <Token label="Whom" verb="shared with" optional options={data.recipients.map((s) => ({ id: s.id, label: s.name, sub: `${s.kindLabel} · ${s.country}` }))} selected={whom} onChange={setWhom} hint="Recipients come from your register" />
              </div>
              {err && <div className="notice warn" style={{ margin: 0 }}>{err}</div>}
            </div>

            <aside className="composer-summary stack" style={{ flex: "0 0 240px", borderLeft: "1px solid var(--border)", padding: 16, gap: 14, overflow: "auto", background: "var(--surface-sunken, #f8fafc)" }}>
              <div className="stack" style={{ gap: 6 }}>
                <span className="cell-sub" style={{ fontWeight: 600 }}>Progress</span>
                <div className="row" style={{ gap: 5 }}>{checks.map((c) => <span key={c.key} title={c.label} style={{ width: 9, height: 9, borderRadius: "50%", background: c.pass ? "var(--green, #16a34a)" : "transparent", border: c.pass ? "none" : c === nextUnmet ? "2px solid var(--yellow-700,#b45309)" : "1px solid var(--border,#cbd5e1)" }} />)}</div>
                {nextUnmet && <span className="cell-sub">Next: {nextHint(nextUnmet.key)}</span>}
              </div>
              <div className="stack" style={{ gap: 4 }}>
                <span className="cell-sub" style={{ fontWeight: 600 }}>Path</span>
                <span className="cell-sub">{pathPreview(data, { who, how, why, where, whom }) || "Fill the sentence to see the path."}</span>
              </div>
              {consequences.length > 0 && <div className="stack" style={{ gap: 4 }}><span className="cell-sub" style={{ fontWeight: 600 }}>On submit</span>{consequences.map((c, i) => <span key={i} className="cell-sub">· {c}</span>)}</div>}
              {dup && <div className="notice warn" style={{ margin: 0 }}><strong>This looks like {dup.name}</strong> ({dup.overlap} of {Math.max(what.length, dup.fieldIds.length)} fields match).<div className="row" style={{ gap: 8, marginTop: 6 }}><button className="btn sm" onClick={() => setDupDismissed(true)}>Keep as new</button></div></div>}
            </aside>
          </div>
        )}

        {step === "compose" && (
          <div className="mp-drawer-foot row" style={{ justifyContent: "space-between", gap: 8, padding: 12, borderTop: "1px solid var(--border)" }}>
            <button className="btn" disabled={pending || name.trim().length < 3} onClick={() => create(false)}>Save draft</button>
            <button className="btn primary" disabled={pending || !canSubmit} title={canSubmit ? undefined : nextUnmet ? `Next: ${nextHint(nextUnmet.key)}` : undefined} onClick={() => create(true)}>{submitLabel}</button>
          </div>
        )}
      </div>

      {newPurpose !== null && data && (
        <PurposeDrawer mode="composer" initialName={newPurpose} linkedActivity={name || "this activity"}
          existing={data.purposes.map((p) => ({ id: p.id, name: p.name }))}
          onClose={() => setNewPurpose(null)}
          onUse={(id) => { setNewPurpose(null); if (!why.includes(id)) setWhy([...why, id]); }}
          onSaved={(id) => { setNewPurpose(null); getComposerDataAction().then(setData); setWhy((w) => [...w, id]); }} />
      )}
    </div>, document.body);
}

function nextHint(key: string): string {
  return key === "basics" ? "add an owner, a data principal and a purpose"
    : key === "data" ? "choose what data is used"
    : key === "systems" ? "choose where it's stored"
    : key === "purposes" ? "every purpose must be approved or a new draft"
    : key === "dpo" ? "submit for DPO review" : "add it to a notice";
}

function pathPreview(data: ComposerData, s: { who: string[]; how: string | null; why: string[]; where: string[]; whom: string[] }): string {
  const parts: string[] = [];
  if (s.who[0]) parts.push(data.principals.find((p) => p.id === s.who[0])?.label ?? "");
  if (s.how) parts.push(s.how);
  if (s.why[0]) parts.push(data.purposes.find((p) => p.id === s.why[0])?.name ?? "");
  if (s.where[0]) parts.push(data.systems.find((x) => x.id === s.where[0])?.name ?? "");
  if (s.whom[0]) parts.push(data.recipients.find((x) => x.id === s.whom[0])?.name ?? "");
  return parts.filter(Boolean).join(" → ");
}

// --- Start screen -----------------------------------------------------------
function StartScreen({ data, pending, onTemplate, onDescribe, onBlank }: {
  data: ComposerData; pending: number;
  onTemplate: (t: ComposerData["templates"][number]) => void;
  onDescribe: (text: string) => void;
  onBlank: () => void;
}) {
  const [mode, setMode] = useState<Start | null>(() => { try { return (localStorage.getItem(LAST_KEY) as Start) || null; } catch { return null; } });
  const [tplQ, setTplQ] = useState("");
  const [desc, setDesc] = useState("");
  const pick = (m: Start) => { setMode(m); try { localStorage.setItem(LAST_KEY, m); } catch { /* fine */ } };

  const cards: { key: Start; icon: React.ReactNode; title: string; sub: string }[] = [
    { key: "template", icon: <LayoutTemplate size={18} />, title: "Use a template", sub: "Common banking activities, pre-filled. Change what’s different." },
    { key: "describe", icon: <PenLine size={18} />, title: "Describe it", sub: "Write a sentence or two. We’ll fill in what we can." },
    { key: "blank", icon: <FilePlus2 size={18} />, title: "Start blank", sub: "Fill it in yourself." },
  ];

  return (
    <div className="mp-drawer-body stack" style={{ gap: 14, overflow: "auto", padding: 16 }}>
      <div className="pa-start-cards">
        {cards.map((c) => (
          <button key={c.key} className={`pa-start-card${mode === c.key ? " on" : ""}`} onClick={() => { pick(c.key); if (c.key === "blank") onBlank(); }}>
            {c.icon}<span className="pa-start-title">{c.title}</span><span className="cell-sub">{c.sub}</span>
          </button>
        ))}
      </div>

      {mode === "template" && (
        <div className="pa-start-panel stack" style={{ gap: 6 }}>
          <div className="inv-search" style={{ maxWidth: 280 }}><Search size={13} /><input placeholder="Search templates" value={tplQ} onChange={(e) => setTplQ(e.target.value)} /></div>
          {data.templates.filter((t) => t.name.toLowerCase().includes(tplQ.toLowerCase())).map((t) => (
            <button key={t.id} className="pa-pick-row" style={{ textAlign: "left", cursor: "pointer" }} onClick={() => onTemplate(t)}><span className="stack" style={{ gap: 1 }}><span>{t.name}</span><span className="cell-sub">{t.sub}</span></span></button>
          ))}
          {data.templates.length === 0 && <span className="cell-sub">No templates yet.</span>}
        </div>
      )}
      {mode === "describe" && (
        <div className="stack" style={{ gap: 8 }}>
          <textarea className="input" rows={4} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Loan applicants upload PAN and salary slips in the mobile app so we can assess credit. It's stored in Core Banking and shared with CIBIL." />
          <div className="row" style={{ justifyContent: "flex-end" }}><button className="btn primary" disabled={desc.trim().length < 10} onClick={() => onDescribe(desc)}>Fill in →</button></div>
        </div>
      )}

      <div className="stack" style={{ gap: 4, borderTop: "1px solid var(--border-soft)", paddingTop: 12 }}>
        {pending > 0 && <a href="/data-map/suggested-activities" className="link-btn">{pending} suggested {pending === 1 ? "activity" : "activities"} from DLP {pending === 1 ? "is" : "are"} waiting →</a>}
        <span className="cell-sub">Adding many at once? <span style={{ opacity: 0.6 }}>Spreadsheet import — coming soon.</span></span>
      </div>
    </div>
  );
}

// --- Tokens -----------------------------------------------------------------
interface Opt { id: string; label: string; sub?: string; tag?: string; warn?: string }
function Token({ label, verb, hideVerb, optional, options, selected, onChange, hint, create, onCreate, manual, onManual, rankSystem }: {
  label: string; verb: string; hideVerb?: boolean; optional?: boolean; options: Opt[]; selected: string[]; onChange: (v: string[]) => void;
  hint?: string; create?: "principal" | "field" | "purpose"; onCreate?: (text: string) => void; manual?: string[]; onManual?: (v: string[]) => void; rankSystem?: string[];
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }; document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h); }, []);
  const byId = new Map(options.map((o) => [o.id, o]));
  let shown = options.filter((o) => !selected.includes(o.id) && (!q || o.label.toLowerCase().includes(q.toLowerCase()) || o.sub?.toLowerCase().includes(q.toLowerCase())));
  if (rankSystem?.length) shown = [...shown].sort((a, b) => (rankSystem.some((s) => b.sub?.startsWith(s)) ? 1 : 0) - (rankSystem.some((s) => a.sub?.startsWith(s)) ? 1 : 0));
  const canCreate = create && q.trim().length >= 2 && !options.some((o) => o.label.toLowerCase() === q.trim().toLowerCase());
  const toggle = (id: string) => onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);

  return (
    <div className="composer-token" ref={ref} style={{ position: "relative" }}>
      <div className="row" style={{ gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        <span className="cell-sub" style={{ minWidth: 52, fontWeight: 600 }}>{label}</span>
        {!hideVerb && <span className="cell-sub">{verb}</span>}
        {selected.map((id) => { const o = byId.get(id); return <span key={id} className="chip" style={{ fontSize: 11.5 }}>{o?.label ?? id}<button className="chip-x" onClick={() => toggle(id)} style={{ marginLeft: 4, cursor: "pointer", border: 0, background: "none" }}>×</button></span>; })}
        {(manual ?? []).map((m) => <span key={m} className="chip" style={{ fontSize: 11.5, borderStyle: "dashed" }}>{m}<button className="chip-x" onClick={() => onManual?.((manual ?? []).filter((x) => x !== m))} style={{ marginLeft: 4, cursor: "pointer", border: 0, background: "none" }}>×</button></span>)}
        <button className="btn ghost sm" onClick={() => setOpen((o) => !o)}>+ {optional ? "add (optional)" : "add"}</button>
      </div>
      {selected.some((id) => byId.get(id)?.warn) && <div className="cell-sub sev-warning" style={{ paddingLeft: 58 }}>{byId.get(selected.find((id) => byId.get(id)?.warn)!)?.warn}</div>}
      {open && (
        <div className="popover-menu" style={{ position: "absolute", top: "100%", left: 52, zIndex: 20, minWidth: 280, maxHeight: 260, overflow: "auto", padding: 6 }}>
          <div className="inv-search sm" style={{ margin: "2px 4px 6px" }}><Search size={12} /><input autoFocus placeholder={`Search ${label.toLowerCase()}`} value={q} onChange={(e) => setQ(e.target.value)} /></div>
          {shown.slice(0, 40).map((o) => (
            <button key={o.id} className="pm-item" style={{ width: "100%", textAlign: "left" }} onClick={() => { toggle(o.id); setQ(""); }}>
              <span className="row" style={{ justifyContent: "space-between", gap: 8 }}><span>{o.label}{o.tag && <span className="chip" style={{ marginLeft: 6, fontSize: 10 }}>{o.tag}</span>}</span>{o.sub && <span className="cell-sub">{o.sub}</span>}</span>
            </button>
          ))}
          {canCreate && create === "field" && <button className="pm-item" style={{ width: "100%", textAlign: "left", color: "var(--accent)" }} onClick={() => { onManual?.([...(manual ?? []), q.trim()]); setQ(""); }}>Add “{q.trim()}” as a manual field</button>}
          {canCreate && create === "purpose" && <button className="pm-item" style={{ width: "100%", textAlign: "left", color: "var(--accent)" }} onClick={() => { onCreate?.(q.trim()); setOpen(false); setQ(""); }}>Create purpose “{q.trim()}”</button>}
          {canCreate && create === "principal" && <button className="pm-item" style={{ width: "100%", textAlign: "left", color: "var(--accent)" }} onClick={() => { onChange([...selected, q.trim()]); setQ(""); }}>Add “{q.trim()}”</button>}
          {shown.length === 0 && !canCreate && <div className="cell-sub" style={{ padding: 8 }}>No matches.{hint ? ` ${hint}.` : ""}</div>}
          {hint && shown.length > 0 && <div className="cell-sub" style={{ padding: "6px 8px 2px", borderTop: "1px solid var(--border-soft)", marginTop: 4 }}>{hint}</div>}
        </div>
      )}
    </div>
  );
}

function SingleToken({ label, options, selected, onChange, hint }: { label: string; options: string[]; selected: string | null; onChange: (v: string | null) => void; hint?: string }) {
  return (
    <div className="row" style={{ gap: 6, alignItems: "center", flexWrap: "wrap" }}>
      <span className="cell-sub" style={{ minWidth: 52, fontWeight: 600 }}>{label}</span>
      <select className="input sm" style={{ width: "auto", minWidth: 160 }} value={selected ?? ""} onChange={(e) => onChange(e.target.value || null)}>
        <option value="">Choose a channel…</option>{options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
      {hint && <span className="cell-sub" style={{ opacity: 0.7 }}>{hint}</span>}
    </div>
  );
}
