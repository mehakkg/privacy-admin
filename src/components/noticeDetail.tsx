"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Eye, RotateCcw, ShieldCheck } from "lucide-react";
import { Card, Pill, Notice, formatDateTime } from "@/components/ui";
import { ActionError } from "@/components/actions";
import {
  saveNoticeContentAction,
  saveVariantAction,
  saveNoticeMetaAction,
  setRule3ManualAction,
  restoreNoticeVersionAction,
  submitNoticeForApprovalAction,
  approveNoticeAction,
  rejectNoticeApprovalAction,
  retireNoticeAction,
  duplicateNoticeAction,
  deleteNoticeAction,
} from "@/app/actions/consent";
import { REGIONS, SCHEDULE_8_LANGUAGES, DATA_CATEGORIES, DATA_CATEGORY_LABEL } from "@/lib/domain";
import {
  evaluateRule3,
  regionLanguageGaps,
  languageLabel,
  regionLabel,
  STATE_REGIONS,
  ALL_INDIA,
  type Rule3Manual,
  type Rule3Key,
} from "@/lib/notices";
import type { ActionResult } from "@/app/actions/requests";

function useAction() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const run = (op: () => Promise<ActionResult>, after?: () => void) =>
    start(async () => {
      const r = await op();
      setResult(r);
      if (r.ok) {
        after?.();
        router.refresh();
      }
    });
  return { pending, result, run };
}

// --- Content & metadata ----------------------------------------------------

export interface Option { id: string; name: string }

/**
 * Fiduciary / Data Category / Purpose. Captured at creation, so here it is a
 * COLLAPSED summary with a small inline edit — it doesn't compete with the main
 * content editor's own save. Expanding reveals the controlled dropdowns.
 */
export function NoticeMeta({
  noticeId,
  fiduciaryId,
  dataCategory,
  purposeTagId,
  fiduciaries,
  purposes,
}: {
  noticeId: string;
  fiduciaryId: string | null;
  dataCategory: string | null;
  purposeTagId: string | null;
  fiduciaries: Option[];
  purposes: Option[];
}) {
  const { pending, result, run } = useAction();
  const [open, setOpen] = useState(false);
  const [fid, setFid] = useState(fiduciaryId ?? "");
  const [cat, setCat] = useState(dataCategory ?? "");
  const [pur, setPur] = useState(purposeTagId ?? "");
  const dirty = fid !== (fiduciaryId ?? "") || cat !== (dataCategory ?? "") || pur !== (purposeTagId ?? "");

  const fidName = fiduciaries.find((f) => f.id === fiduciaryId)?.name ?? "—";
  const catName = dataCategory ? (DATA_CATEGORY_LABEL[dataCategory as keyof typeof DATA_CATEGORY_LABEL] ?? dataCategory) : "—";
  const purName = purposes.find((p) => p.id === purposeTagId)?.name ?? "—";

  return (
    <div className="classification">
      <button className="classification-summary" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="cell-sub">Classification</span>
        <span className="class-chips">
          <span className="class-chip">{fidName}</span>
          <span className="class-chip">{catName}</span>
          <span className="class-chip">{purName}</span>
        </span>
        <span className="cell-sub" style={{ marginLeft: "auto" }}>{open ? "Close" : "Edit classification"}</span>
      </button>
      {open && (
        <div className="classification-edit">
          <div className="form-grid">
            <label className="field">
              <span className="field-label">Fiduciary <span className="req">required</span></span>
              <select className="input sm" value={fid} onChange={(e) => setFid(e.target.value)}>
                <option value="">Select a Fiduciary…</option>
                {fiduciaries.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </label>
            <label className="field">
              <span className="field-label">Data Category <span className="req">required</span></span>
              <select className="input sm" value={cat} onChange={(e) => setCat(e.target.value)}>
                <option value="">Select a category…</option>
                {DATA_CATEGORIES.map((c) => <option key={c} value={c}>{DATA_CATEGORY_LABEL[c]}</option>)}
              </select>
            </label>
            <label className="field">
              <span className="field-label">Purpose <span className="req">required</span> <span className="lock-mark">🔒 DPO</span></span>
              <select className="input sm" value={pur} onChange={(e) => setPur(e.target.value)}>
                <option value="">Select an approved purpose…</option>
                {purposes.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
          </div>
          <div className="row" style={{ marginTop: 8 }}>
            <button className="btn sm" disabled={pending || !dirty} onClick={() => run(() => saveNoticeMetaAction(noticeId, fid, cat, pur), () => setOpen(false))}>
              {pending ? "Saving…" : "Save"}
            </button>
            <span className="cell-sub">Category and Purpose are controlled lists — never free text.</span>
          </div>
          <ActionError result={result} />
        </div>
      )}
    </div>
  );
}

/** Content editor. The change-reason is required — save stays disabled without it. */
export function NoticeContentEditor({ noticeId, content }: { noticeId: string; content: string }) {
  const { pending, result, run } = useAction();
  const [value, setValue] = useState(content);
  const [note, setNote] = useState("");
  const changed = value !== content;

  return (
    <div>
      <textarea
        className="input"
        style={{ minHeight: 220, fontFamily: "var(--font)", lineHeight: 1.5 }}
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      <input
        className="input"
        style={{ marginTop: 8 }}
        placeholder="What changed in this version? (required — saved to history)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <div className="row" style={{ marginTop: 10 }}>
        <button
          className="btn primary"
          disabled={pending || !changed || !note.trim()}
          title={!note.trim() ? "A change reason is required" : undefined}
          onClick={() => run(() => saveNoticeContentAction(noticeId, value, note), () => setNote(""))}
        >
          {pending ? "Saving…" : "Save new version"}
        </button>
        <span className="cell-sub">
          {changed && !note.trim() ? "Add a change reason to save." : "Each save bumps the version and lands in history."}
        </span>
      </div>
      <ActionError result={result} />
    </div>
  );
}

/** Rule 3 checklist — auto-detects the three links, manual override for the rest. */
export function Rule3Panel({ noticeId, content, manual }: { noticeId: string; content: string; manual: Rule3Manual }) {
  const { pending, result, run } = useAction();
  const [editing, setEditing] = useState<Rule3Key | null>(null);
  const [note, setNote] = useState("");
  const rule3 = evaluateRule3(content, manual);

  return (
    <Card
      title={
        <span className="row" style={{ gap: 8 }}>
          <ShieldCheck size={16} /> Rule 3 compliance
          <Pill tone={rule3.complete ? "green" : "yellow"}>{rule3.satisfied}/5</Pill>
        </span>
      }
    >
      <p className="cell-sub" style={{ marginTop: 0 }}>
        DPDP Rules 2025, Rule 3. All five must be met before Publish is reachable.
      </p>
      <div className="stack" style={{ gap: 6 }}>
        {rule3.items.map((item) => (
          <div key={item.key} className="rule3-row">
            <span className={`rule3-check ${item.ok ? "on" : ""}`} aria-hidden>{item.ok ? "✓" : ""}</span>
            <div className="cell-stack" style={{ flex: 1 }}>
              <span className={item.ok ? "" : "cell-sub"}>{item.label}</span>
              {item.auto && <span className="cell-sub">Auto-detected in the body.</span>}
              {item.manual && <span className="cell-sub">Manually confirmed: {item.note}</span>}
              {!item.ok && <span className="cell-sub">{item.hint}</span>}
              {editing === item.key && (
                <div className="stack" style={{ gap: 6, marginTop: 4 }}>
                  <input className="input sm" placeholder="Where is this requirement met? (required)" value={note} onChange={(e) => setNote(e.target.value)} autoFocus />
                  <div className="row" style={{ gap: 6 }}>
                    <button className="btn primary xs" disabled={pending || !note.trim()} onClick={() => run(() => setRule3ManualAction(noticeId, item.key, true, note), () => { setEditing(null); setNote(""); })}>
                      Confirm
                    </button>
                    <button className="btn ghost xs" onClick={() => { setEditing(null); setNote(""); }}>Cancel</button>
                  </div>
                </div>
              )}
            </div>
            {editing !== item.key && (
              item.manual ? (
                <button className="btn ghost xs" disabled={pending} onClick={() => run(() => setRule3ManualAction(noticeId, item.key, false, ""))}>Clear</button>
              ) : !item.auto ? (
                <button className="btn ghost xs" onClick={() => { setEditing(item.key); setNote(""); }}>Confirm manually</button>
              ) : null
            )}
          </div>
        ))}
      </div>
      <ActionError result={result} />
    </Card>
  );
}

/** Version history — View (read-only) and Restore (creates a new version). */
export function NoticeVersionHistory({
  noticeId,
  revisions,
}: {
  noticeId: string;
  revisions: { id: string; version: string; content: string; note: string | null; savedBy: string; savedAt: string }[];
}) {
  const { pending, result, run } = useAction();
  const [viewing, setViewing] = useState<string | null>(null);

  if (revisions.length === 0) return <div className="empty">No saved versions yet.</div>;

  return (
    <div className="stack" style={{ gap: 10 }}>
      {revisions.map((r) => (
        <div key={r.id} className="version-row">
          <div className="row" style={{ gap: 8, alignItems: "flex-start" }}>
            <span className="mono cell-primary">{r.version}</span>
            <div className="cell-stack" style={{ flex: 1 }}>
              <span className="cell-sub">{r.note ?? "—"}</span>
              <span className="cell-sub">{r.savedBy} · {formatDateTime(new Date(r.savedAt))}</span>
            </div>
            <button className="btn ghost xs" onClick={() => setViewing((v) => (v === r.id ? null : r.id))}>
              <Eye size={13} /> {viewing === r.id ? "Hide" : "View"}
            </button>
            <button className="btn ghost xs" disabled={pending} onClick={() => run(() => restoreNoticeVersionAction(noticeId, r.id))}>
              <RotateCcw size={13} /> Restore
            </button>
          </div>
          {viewing === r.id && (
            <div className="version-view">{r.content || "(empty)"}</div>
          )}
        </div>
      ))}
      <ActionError result={result} />
    </div>
  );
}

// --- Variants --------------------------------------------------------------

export function NoticeVariants({
  noticeId,
  baseContent,
  variants,
  regions,
}: {
  noticeId: string;
  baseContent: string;
  variants: { language: string; content: string }[];
  regions: string[];
}) {
  const { pending, result, run } = useAction();
  const byLang = new Map(variants.map((v) => [v.language, v.content]));
  const [active, setActive] = useState(variants[0]?.language ?? "en");
  const [value, setValue] = useState(byLang.get(active) ?? "");
  const gaps = regionLanguageGaps(regions, variants.filter((v) => v.content.trim()).map((v) => v.language));

  const pick = (lang: string) => {
    setActive(lang);
    setValue(byLang.get(lang) ?? "");
  };

  return (
    <Card title="Language variants">
      <p className="cell-sub" style={{ marginTop: 0 }}>
        Eighth Schedule languages (DPDP s.5(3)). A variant with no content falls back to the base notice.
      </p>
      {gaps.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <Notice tone="warn" title="Region / language gap">
            {gaps.map((g) => (
              <div key={g.region}>{g.regionLabel} is selected but no {g.languageLabel} variant exists.</div>
            ))}
          </Notice>
        </div>
      )}
      <div className="row" style={{ gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
        {SCHEDULE_8_LANGUAGES.map((l) => (
          <button key={l.code} className={`btn xs ${active === l.code ? "primary" : "ghost"}`} onClick={() => pick(l.code)}>
            {l.label}{byLang.has(l.code) && byLang.get(l.code) ? " ✓" : ""}
          </button>
        ))}
      </div>
      <textarea
        className="input"
        style={{ minHeight: 180, lineHeight: 1.5 }}
        placeholder={`Translated content for ${languageLabel(active)}. Leave blank to fall back to: “${baseContent.slice(0, 60)}…”`}
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      <div className="row" style={{ marginTop: 10 }}>
        <button className="btn primary" disabled={pending} onClick={() => run(() => saveVariantAction(noticeId, active, value))}>
          {pending ? "Saving…" : `Save ${languageLabel(active)} variant`}
        </button>
      </div>
      <ActionError result={result} />
    </Card>
  );
}

// --- Preview ---------------------------------------------------------------

export function NoticePreview({
  name,
  baseContent,
  variants,
}: {
  name: string;
  baseContent: string;
  variants: { language: string; content: string }[];
}) {
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const langs = ["en", ...variants.filter((v) => v.content.trim() && v.language !== "en").map((v) => v.language)];
  const [lang, setLang] = useState("en");
  const byLang = new Map(variants.map((v) => [v.language, v.content]));
  const content = (lang === "en" ? byLang.get("en") : byLang.get(lang)) || baseContent;

  return (
    <Card
      title="Preview"
      actions={
        <div className="row" style={{ gap: 8 }}>
          <select className="input sm" style={{ width: 130 }} value={lang} onChange={(e) => setLang(e.target.value)}>
            {langs.map((l) => <option key={l} value={l}>{languageLabel(l)}</option>)}
          </select>
          <div className="row" style={{ gap: 4 }}>
            <button className={`btn xs ${device === "desktop" ? "primary" : "ghost"}`} onClick={() => setDevice("desktop")}>Desktop</button>
            <button className={`btn xs ${device === "mobile" ? "primary" : "ghost"}`} onClick={() => setDevice("mobile")}>Mobile</button>
          </div>
        </div>
      }
    >
      <div style={{ display: "grid", placeItems: "center", padding: 16, background: "var(--bg-page)", borderRadius: "var(--radius-md)" }}>
        <div
          style={{
            width: device === "mobile" ? 320 : "100%",
            maxWidth: device === "mobile" ? 320 : 640,
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-md)",
            background: "var(--bg)",
            padding: 20,
            transition: "width 0.2s",
          }}
        >
          <h3 style={{ marginTop: 0, fontSize: 16 }}>{name}</h3>
          <p style={{ fontSize: 13.5, lineHeight: 1.6, color: "var(--text-2)", whiteSpace: "pre-wrap" }}>
            {content || "No content yet — add it on the Content & Versions tab."}
          </p>
        </div>
      </div>
    </Card>
  );
}

// --- Publish settings ------------------------------------------------------

export function NoticePublish({
  noticeId,
  status,
  regions,
  notifyOnChange,
  approvalState,
  pendingRegions,
  submittedBy,
  role,
  rule3Complete,
  rule3Satisfied,
  supersedeOptions,
  notifyUserCount,
}: {
  noticeId: string;
  status: string;
  regions: string[];
  notifyOnChange: boolean;
  approvalState: string;
  pendingRegions: string[];
  submittedBy: string | null;
  role: string;
  rule3Complete: boolean;
  rule3Satisfied: number;
  supersedeOptions: Option[];
  notifyUserCount: number;
}) {
  const { pending, result, run } = useAction();
  const initialMode: "all" | "states" = regions.includes(ALL_INDIA) || regions.length === 0 ? "all" : "states";
  const [mode, setMode] = useState<"all" | "states">(initialMode);
  const [states, setStates] = useState<string[]>(regions.filter((r) => r !== ALL_INDIA));
  const [notify, setNotify] = useState(notifyOnChange);
  const [confirmNotify, setConfirmNotify] = useState(false);
  const [rejectNote, setRejectNote] = useState("");
  const isDpo = role === "dpo";

  const chosen = mode === "all" ? [ALL_INDIA] : states;
  const toggleState = (code: string) =>
    setStates((s) => (s.includes(code) ? s.filter((x) => x !== code) : [...s, code]));

  const submit = () =>
    run(() => submitNoticeForApprovalAction(noticeId, "publish", chosen, notify), () => setConfirmNotify(false));

  // A publish is pending DPO approval.
  if (approvalState === "pending_publish") {
    return (
      <Card title="Publish settings">
        <Notice tone="info" title="Awaiting DPO approval to publish">
          Submitted by {submittedBy ?? "Admin"} for regions: {pendingRegions.map(regionLabel).join(", ") || "—"}.
        </Notice>
        {isDpo ? (
          <div className="stack" style={{ gap: 10, marginTop: 12 }}>
            <button className="btn primary" disabled={pending} onClick={() => run(() => approveNoticeAction(noticeId))}>
              {pending ? "Publishing…" : "Approve & Publish"}
            </button>
            <div className="row" style={{ gap: 6 }}>
              <input className="input sm" placeholder="Reason for rejection (optional)" value={rejectNote} onChange={(e) => setRejectNote(e.target.value)} />
              <button className="btn sm" disabled={pending} onClick={() => run(() => rejectNoticeApprovalAction(noticeId, rejectNote))}>Reject</button>
            </div>
          </div>
        ) : (
          <p className="cell-sub" style={{ marginTop: 12 }}>Switch to the DPO role to approve. Admin cannot publish directly.</p>
        )}
        <ActionError result={result} />
      </Card>
    );
  }

  // An unpublish is pending DPO approval.
  if (approvalState === "pending_unpublish") {
    return (
      <Card title="Publish settings">
        <Notice tone="warn" title="Awaiting DPO approval to unpublish">
          {submittedBy ?? "Admin"} has requested this live notice be moved back to Draft.
        </Notice>
        {isDpo ? (
          <div className="stack" style={{ gap: 10, marginTop: 12 }}>
            <button className="btn primary" disabled={pending} onClick={() => run(() => approveNoticeAction(noticeId))}>
              {pending ? "Applying…" : "Approve — move to Draft"}
            </button>
            <div className="row" style={{ gap: 6 }}>
              <input className="input sm" placeholder="Reason for rejection (optional)" value={rejectNote} onChange={(e) => setRejectNote(e.target.value)} />
              <button className="btn sm" disabled={pending} onClick={() => run(() => rejectNoticeApprovalAction(noticeId, rejectNote))}>Reject</button>
            </div>
          </div>
        ) : (
          <p className="cell-sub" style={{ marginTop: 12 }}>Switch to the DPO role to approve.</p>
        )}
        <ActionError result={result} />
      </Card>
    );
  }

  return (
    <div className="stack" style={{ gap: 16 }}>
      <Card title="Publish settings">
        {!rule3Complete && (
          <div style={{ marginBottom: 14 }}>
            <Notice tone="warn" title="Rule 3 checklist is incomplete">
              {rule3Satisfied}/5 requirements met. Finish the checklist on the Content &amp; Versions tab before this notice can be submitted.
            </Notice>
          </div>
        )}

        <div className="section-label">Regions</div>
        <div className="row" style={{ gap: 6, marginBottom: 10 }}>
          <button className={`btn sm ${mode === "all" ? "primary" : "ghost"}`} onClick={() => setMode("all")}>All India</button>
          <button className={`btn sm ${mode === "states" ? "primary" : "ghost"}`} onClick={() => setMode("states")}>Specific states</button>
        </div>
        {mode === "all" ? (
          <p className="cell-sub" style={{ marginTop: 0, marginBottom: 14 }}>Published nationwide. Selecting specific states clears this.</p>
        ) : (
          <div className="row" style={{ gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
            {STATE_REGIONS.map((r) => (
              <button key={r.code} className={`btn sm ${states.includes(r.code) ? "primary" : "ghost"}`} onClick={() => toggleState(r.code)}>
                {r.label}
              </button>
            ))}
          </div>
        )}

        <label className="row" style={{ gap: 8, marginBottom: 14 }}>
          <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
          <span>Notify existing users when this notice is published</span>
        </label>

        <div className="row">
          {isDpo ? (
            <button
              className="btn primary"
              disabled={pending || !rule3Complete || (mode === "states" && states.length === 0)}
              onClick={() => (notify ? setConfirmNotify(true) : submit())}
              title={!rule3Complete ? "Complete Rule 3 first" : undefined}
            >
              {pending ? "Working…" : "Submit for approval"}
            </button>
          ) : (
            <button
              className="btn primary"
              disabled={pending || !rule3Complete || (mode === "states" && states.length === 0)}
              onClick={() => (notify ? setConfirmNotify(true) : submit())}
              title={!rule3Complete ? "Complete Rule 3 first" : undefined}
            >
              {pending ? "Submitting…" : "Submit for approval"}
            </button>
          )}
          <span className="cell-sub">Publishing is DPO-gated — Admin submits, the DPO approves.</span>
        </div>
        <ActionError result={result} />
      </Card>

      {status === "published" && (
        <UnpublishRetire noticeId={noticeId} supersedeOptions={supersedeOptions} />
      )}

      {confirmNotify && (
        <div className="modal-scrim" onClick={() => setConfirmNotify(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>Notify existing users?</h3>
            <p className="cell-sub">
              This will notify <strong>{notifyUserCount.toLocaleString()}</strong> existing users once the notice is published. This is hard to undo.
            </p>
            <div className="row" style={{ gap: 8, marginTop: 12 }}>
              <button className="btn primary" disabled={pending} onClick={submit}>Continue</button>
              <button className="btn ghost" onClick={() => setConfirmNotify(false)}>Cancel</button>
            </div>
            <ActionError result={result} />
          </div>
        </div>
      )}
    </div>
  );
}

/** Unpublish (DPO-gated) and Retire (with superseding notice) for a live notice. */
function UnpublishRetire({ noticeId, supersedeOptions }: { noticeId: string; supersedeOptions: Option[] }) {
  const { pending, result, run } = useAction();
  const [retiring, setRetiring] = useState(false);
  const [supersededBy, setSupersededBy] = useState("");

  return (
    <Card title="Lifecycle">
      <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
        <div className="stack" style={{ gap: 4 }}>
          <button className="btn sm" disabled={pending} onClick={() => run(() => submitNoticeForApprovalAction(noticeId, "unpublish", [], false))}>
            Unpublish → Draft
          </button>
          <span className="cell-sub">DPO-gated, like publishing.</span>
        </div>
        <div className="stack" style={{ gap: 4 }}>
          {!retiring ? (
            <button className="btn sm" onClick={() => setRetiring(true)}>Retire…</button>
          ) : (
            <div className="stack" style={{ gap: 6 }}>
              <select className="input sm" value={supersededBy} onChange={(e) => setSupersededBy(e.target.value)}>
                <option value="">Superseded by… (optional)</option>
                {supersedeOptions.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
              <div className="row" style={{ gap: 6 }}>
                <button className="btn primary sm" disabled={pending} onClick={() => run(() => retireNoticeAction(noticeId, supersededBy || null))}>
                  Confirm retire
                </button>
                <button className="btn ghost sm" onClick={() => setRetiring(false)}>Cancel</button>
              </div>
            </div>
          )}
          <span className="cell-sub">Terminal state — records what replaced it.</span>
        </div>
      </div>
      <ActionError result={result} />
    </Card>
  );
}

// --- Page-level action menu (header) ---------------------------------------

/**
 * Duplicate / Retire / Delete for the detail header. Three actions on a page
 * with room to spare, so they are explicit labelled buttons — not hidden behind
 * a "⋯" dropdown. Retire only appears for a Published notice.
 */
export function NoticePageActions({
  noticeId,
  name,
  status,
  supersedeOptions,
}: {
  noticeId: string;
  name: string;
  status: string;
  supersedeOptions: Option[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const [retiring, setRetiring] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [supersededBy, setSupersededBy] = useState("");
  const [typed, setTyped] = useState("");

  const act = (op: () => Promise<ActionResult>, onOk?: () => void) =>
    start(async () => {
      const r = await op();
      setResult(r);
      if (r.ok) { onOk?.(); router.refresh(); }
    });

  return (
    <div className="row" style={{ gap: 8, position: "relative" }}>
      <button className="btn sm" disabled={pending} onClick={() => act(() => duplicateNoticeAction(noticeId))}>Duplicate</button>

      {status === "published" && (
        <span className="rowmenu">
          <button className="btn sm" onClick={() => setRetiring((v) => !v)}>Retire</button>
          {retiring && (
            <>
              <div className="rowmenu-scrim" onClick={() => setRetiring(false)} />
              <div className="rowmenu-pop" onClick={(e) => e.stopPropagation()} style={{ minWidth: 260 }}>
                <div className="section-label" style={{ marginTop: 0 }}>Retire this notice</div>
                <select className="input sm" value={supersededBy} onChange={(e) => setSupersededBy(e.target.value)} style={{ marginBottom: 8 }}>
                  <option value="">Superseded by… (optional)</option>
                  {supersedeOptions.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
                <div className="row" style={{ gap: 6 }}>
                  <button className="btn primary sm" disabled={pending} onClick={() => act(() => retireNoticeAction(noticeId, supersededBy || null), () => setRetiring(false))}>Confirm retire</button>
                  <button className="btn ghost sm" onClick={() => setRetiring(false)}>Cancel</button>
                </div>
                <ActionError result={result} />
              </div>
            </>
          )}
        </span>
      )}

      <button className="btn sm btn-outline-danger" onClick={() => setDeleting(true)}>Delete</button>

      {deleting && (
        <div className="modal-scrim" onClick={() => setDeleting(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>Delete “{name}”?</h3>
            <p className="cell-sub">Type <strong>{name}</strong> to confirm. This cannot be undone.</p>
            <input className="input" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={name} autoFocus />
            <div className="row" style={{ gap: 8, marginTop: 12 }}>
              <button className="btn danger" disabled={pending || typed !== name} onClick={() => act(() => deleteNoticeAction(noticeId, typed), () => router.push("/consent/notices"))}>
                {pending ? "Deleting…" : "Delete notice"}
              </button>
              <button className="btn ghost" onClick={() => { setDeleting(false); setTyped(""); }}>Cancel</button>
            </div>
            <ActionError result={result} />
          </div>
        </div>
      )}
    </div>
  );
}
