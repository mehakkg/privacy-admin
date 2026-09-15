"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { X, Lock, Plus, Trash2 } from "lucide-react";
import { Pill, Chip, InfoTip, type PillTone } from "@/components/ui";
import { ActionError } from "@/components/actions";
import { overrideVendorRiskAction, addPurposeMappingAction, removePurposeMappingAction } from "@/app/actions/vendorRisk";
import { provisionPortalAccessAction, revokePortalAccessAction } from "@/app/actions/integration";
import { DATA_CATEGORIES, DATA_CATEGORY_LABEL } from "@/lib/domain";
import { useRouter } from "next/navigation";
import type { ActionResult } from "@/app/actions/requests";

export interface VendorMapping { id: string; purposeName: string; locked: boolean; piiTypes: string[]; activityName: string | null }
export interface Opt { id: string; name: string }
export interface VendorOverride { from: string; to: string; by: string; reason: string; at: string }
export interface VendorDetail {
  id: string;
  name: string;
  category: string;
  riskRating: string;
  riskBaseline: string;
  ownerName: string | null;
  onboardedAt: string | null;
  lastReviewed: string | null;
  purposesCount: number;
  piiCount: number;
  dpa: { name: string | null; scope: string | null; signedAt: string | null; expiresAt: string | null; status: string; daysToExpiry: number | null; docLink: string | null };
  mappings: VendorMapping[];
  overrideHistory: VendorOverride[];
  linkedProcessors: { id: string; name: string; activity: string | null }[];
  portal: { contactName: string; email: string; provisionedAt: string } | null;
}

const RISK_TONE: Record<string, PillTone> = { low: "gray", medium: "yellow", high: "red", critical: "red" };
const RISKS = ["low", "medium", "high", "critical"];

/** DPA status, with "expiring" derived from proximity — never a stored flag. */
export function dpaLabel(status: string, days: number | null): { text: string; tone: PillTone } {
  if (status === "not_on_file") return { text: "Not on file", tone: "gray" };
  if (days !== null && days < 0) return { text: "Expired", tone: "red" };
  if (status === "active" && days !== null && days < 30) return { text: `Expiring (${days}d)`, tone: "yellow" };
  if (status === "active") return { text: "Active", tone: "green" };
  return { text: status, tone: "gray" };
}

export function VendorRegister({ vendors, view, purposes = [], role = "admin" }: { vendors: VendorDetail[]; view: "vendors" | "dpa"; purposes?: Opt[]; role?: string }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const open = vendors.find((v) => v.id === openId) ?? null;

  return (
    <div>
      <div className="table-wrap">
        {view === "vendors" ? (
          <table className="dtable">
            <thead>
              <tr><th>Vendor</th><th>Category</th><th>Risk</th><th>Purposes</th><th>PII types</th><th>DPA status</th><th>Last reviewed</th></tr>
            </thead>
            <tbody>
              {vendors.map((v) => {
                const dpa = dpaLabel(v.dpa.status, v.dpa.daysToExpiry);
                return (
                  <tr key={v.id} className="clickable" onClick={() => setOpenId(v.id)}>
                    <td><span className="row-link">{v.name}</span></td>
                    <td><Chip>{v.category}</Chip></td>
                    <td><Pill tone={RISK_TONE[v.riskRating]}>{v.riskRating}</Pill></td>
                    <td className="cell-sub">{v.purposesCount}</td>
                    <td className="cell-sub">{v.piiCount}</td>
                    <td><Pill tone={dpa.tone}>{dpa.text}</Pill></td>
                    <td className="cell-sub">{v.lastReviewed ?? "—"}</td>
                  </tr>
                );
              })}
              {vendors.length === 0 && (
                <tr><td colSpan={7}>
                  <div className="empty">
                    <p style={{ margin: "0 0 4px", fontWeight: 600 }}>No vendors registered yet</p>
                    <p className="cell-sub" style={{ margin: "0 0 12px" }}>Vendors are added through the assessment intake flow.</p>
                    <Link href="/vendor-risk/assessments" className="btn primary sm">Assign a vendor questionnaire</Link>
                  </div>
                </td></tr>
              )}
            </tbody>
          </table>
        ) : (
          <table className="dtable">
            <thead>
              <tr><th>Vendor</th><th>Agreement scope</th><th>Signed</th><th>Expiry</th><th>Days to expiry</th><th>Status</th></tr>
            </thead>
            <tbody>
              {vendors.map((v) => {
                const dpa = dpaLabel(v.dpa.status, v.dpa.daysToExpiry);
                const red = v.dpa.daysToExpiry !== null && v.dpa.daysToExpiry < 30;
                return (
                  <tr key={v.id} className="clickable" onClick={() => setOpenId(v.id)}>
                    <td><span className="row-link">{v.name}</span></td>
                    <td className="cell-sub">{v.dpa.scope ?? "—"}</td>
                    <td className="cell-sub">{v.dpa.signedAt ?? "—"}</td>
                    <td className="cell-sub">{v.dpa.expiresAt ?? "—"}</td>
                    <td style={{ color: red ? "var(--red)" : undefined, fontWeight: red ? 600 : undefined }}>
                      {v.dpa.daysToExpiry === null ? "—" : v.dpa.daysToExpiry < 0 ? `${-v.dpa.daysToExpiry}d over` : `${v.dpa.daysToExpiry}d`}
                    </td>
                    <td><Pill tone={dpa.tone}>{dpa.text}</Pill></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {open && <VendorDrawer v={open} focusDpa={view === "dpa"} purposes={purposes} role={role} onClose={() => setOpenId(null)} />}
    </div>
  );
}

function initials(name: string): string {
  return name.split(/\s+/).map((p) => p.replace(/[^A-Za-z]/g, "").charAt(0)).filter(Boolean).slice(0, 2).join("").toUpperCase() || "?";
}

/**
 * Purpose & PII mapping — read-only for most roles, editable by Legal/DPO via an
 * inline-add row (this platform's table-with-inline-add convention, not a modal).
 * Policy-locked rows (tied to an approved PurposeTag) never expose a delete
 * control, for any role.
 */
function PurposeMappings({ vendorId, mappings, purposes, canEdit }: { vendorId: string; mappings: VendorMapping[]; purposes: Opt[]; canEdit: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const [adding, setAdding] = useState(false);
  const [purposeId, setPurposeId] = useState("");
  const [pii, setPii] = useState<string[]>([]);
  const [activity, setActivity] = useState("");

  const run = (op: () => Promise<ActionResult>, after?: () => void) =>
    start(async () => { const r = await op(); setResult(r); if (r.ok) { after?.(); router.refresh(); } });
  const reset = () => { setAdding(false); setPurposeId(""); setPii([]); setActivity(""); };

  return (
    <div>
      {mappings.length === 0 ? (
        <p className="cell-sub" style={{ margin: "0 0 8px" }}>No purposes mapped — this vendor is not cleared to touch personal data.</p>
      ) : (
        <div className="table-wrap">
          <table className="dtable">
            <thead><tr><th>Purpose</th><th>PII types</th><th>Activity</th>{canEdit && <th style={{ width: 40 }}></th>}</tr></thead>
            <tbody>
              {mappings.map((m) => (
                <tr key={m.id}>
                  <td>{m.locked ? (
                    <InfoTip align="left" text="Policy-locked — only DPO/Legal can edit"><span className="lock-inline"><Lock size={12} /> {m.purposeName}</span></InfoTip>
                  ) : m.purposeName}</td>
                  <td className="cell-sub" style={{ textTransform: "capitalize" }}>{m.piiTypes.map((t) => DATA_CATEGORY_LABEL[t as keyof typeof DATA_CATEGORY_LABEL] ?? t).join(", ") || "—"}</td>
                  <td className="cell-sub">{m.activityName ?? "—"}</td>
                  {canEdit && (
                    <td>{!m.locked && (
                      <button className="icon-btn" disabled={pending} title="Remove mapping" aria-label="Remove mapping" onClick={() => run(() => removePurposeMappingAction(m.id))}><Trash2 size={14} /></button>
                    )}</td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {canEdit && (
        adding ? (
          <div className="stack" style={{ gap: 6, marginTop: 8 }}>
            <div className="row" style={{ gap: 6, alignItems: "flex-end" }}>
              <label className="field" style={{ flex: 1 }}>
                <span className="field-label">Purpose</span>
                <select className="input sm" value={purposeId} onChange={(e) => setPurposeId(e.target.value)}>
                  <option value="">Select an approved purpose…</option>
                  {purposes.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </label>
              <label className="field" style={{ flex: 1 }}>
                <span className="field-label">Activity (optional)</span>
                <input className="input sm" value={activity} onChange={(e) => setActivity(e.target.value)} placeholder="e.g. Loan Application" />
              </label>
            </div>
            <div>
              <span className="field-label">PII types</span>
              <div className="row" style={{ gap: 6, flexWrap: "wrap", marginTop: 4 }}>
                {DATA_CATEGORIES.map((c) => (
                  <button key={c} className={`btn xs ${pii.includes(c) ? "primary" : "ghost"}`} onClick={() => setPii((s) => s.includes(c) ? s.filter((x) => x !== c) : [...s, c])}>{DATA_CATEGORY_LABEL[c]}</button>
                ))}
              </div>
            </div>
            <div className="row" style={{ gap: 6 }}>
              <button className="btn primary sm" disabled={pending || !purposeId || pii.length === 0} onClick={() => run(() => addPurposeMappingAction(vendorId, purposeId, pii, activity), reset)}>{pending ? "Saving…" : "Add mapping"}</button>
              <button className="btn ghost sm" onClick={reset}>Cancel</button>
            </div>
          </div>
        ) : (
          <button className="link-action" onClick={() => setAdding(true)}><Plus size={12} /> Add purpose mapping</button>
        )
      )}
      <ActionError result={result} />
    </div>
  );
}

/** Screen 4b — one Data-Processor portal login per vendor, provisioned here. */
function PortalAccess({ vendorId, portal, scopeOptions }: { vendorId: string; portal: VendorDetail["portal"]; scopeOptions: { id: string; name: string }[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const [form, setForm] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [scope, setScope] = useState<string[]>(scopeOptions.map((s) => s.id));

  const run = (op: () => Promise<ActionResult>, after?: () => void) =>
    start(async () => { const r = await op(); setResult(r); if (r.ok) { after?.(); router.refresh(); } });

  if (portal) {
    return (
      <div style={{ marginTop: 12 }}>
        <div className="log-entry">
          <span className="log-avatar">{initials(portal.contactName)}</span>
          <div className="cell-stack" style={{ flex: 1 }}>
            <span className="cell-primary">{portal.contactName} · portal access</span>
            <span className="cell-sub">{portal.email} · since {portal.provisionedAt}</span>
          </div>
          <button className="btn ghost xs" disabled={pending} onClick={() => run(() => revokePortalAccessAction(vendorId))}>Revoke</button>
        </div>
        <ActionError result={result} />
      </div>
    );
  }

  return (
    <div style={{ marginTop: 12 }}>
      {!form ? (
        <button className="link-action" onClick={() => setForm(true)}>Provision Processor Portal Access…</button>
      ) : (
        <div className="stack" style={{ gap: 6 }}>
          <input className="input sm" placeholder="Contact name" value={name} onChange={(e) => setName(e.target.value)} />
          <input className="input sm" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
          {scopeOptions.length > 0 && (
            <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
              {scopeOptions.map((s) => (
                <button key={s.id} className={`btn xs ${scope.includes(s.id) ? "primary" : "ghost"}`} onClick={() => setScope((sc) => sc.includes(s.id) ? sc.filter((x) => x !== s.id) : [...sc, s.id])}>{s.name}</button>
              ))}
            </div>
          )}
          <div className="row" style={{ gap: 6 }}>
            <button className="btn primary sm" disabled={pending || !name.trim() || !email.trim()} onClick={() => run(() => provisionPortalAccessAction(vendorId, name, email, scope), () => setForm(false))}>Provision access</button>
            <button className="btn ghost sm" onClick={() => setForm(false)}>Cancel</button>
          </div>
          <span className="cell-sub">One login per vendor. Multiple people are a scoped grant under this vendor, not separate logins.</span>
          <ActionError result={result} />
        </div>
      )}
    </div>
  );
}

function VendorDrawer({ v, focusDpa, purposes, role, onClose }: { v: VendorDetail; focusDpa: boolean; purposes: Opt[]; role: string; onClose: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const [editRisk, setEditRisk] = useState(false);
  const [newRating, setNewRating] = useState(v.riskRating);
  const [reason, setReason] = useState("");
  const dpa = dpaLabel(v.dpa.status, v.dpa.daysToExpiry);

  const saveRisk = () =>
    start(async () => {
      const r = await overrideVendorRiskAction(v.id, newRating, reason);
      setResult(r);
      if (r.ok) { setEditRisk(false); setReason(""); router.refresh(); }
    });

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside className="drawer-panel" style={{ background: "var(--bg)", width: "min(540px, 94vw)" }} onClick={(e) => e.stopPropagation()}>
        {/* Sticky mini-header — stays visible while scrolling. */}
        <div className="drawer-head drawer-sticky">
          <div className="row" style={{ gap: 8 }}>
            <strong>{v.name}</strong>
            <Pill tone={RISK_TONE[v.riskRating]}>{v.riskRating}</Pill>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>
        <div className="drawer-body">
          {/* Overview */}
          <h3 className="drawer-section first">Overview</h3>
          <dl className="kv">
            <div style={{ display: "contents" }}><dt>Category</dt><dd>{v.category}</dd></div>
            <div style={{ display: "contents" }}><dt>Relationship owner</dt><dd>{v.ownerName ?? "—"}</dd></div>
            <div style={{ display: "contents" }}><dt>Onboarded</dt><dd>{v.onboardedAt ?? "—"}</dd></div>
            <div style={{ display: "contents" }}><dt>Baseline (system)</dt><dd><Pill tone={RISK_TONE[v.riskBaseline]} dot={false}>{v.riskBaseline}</Pill></dd></div>
          </dl>

          {!editRisk ? (
            <button className="link-action" onClick={() => { setEditRisk(true); setNewRating(v.riskRating); }}>Override risk rating…</button>
          ) : (
            <div className="stack" style={{ gap: 6, marginTop: 8 }}>
              <div className="row" style={{ gap: 6 }}>
                <select className="input sm" value={newRating} onChange={(e) => setNewRating(e.target.value)} style={{ width: 130 }}>
                  {RISKS.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
                <input className="input sm" placeholder="Reason (required)" value={reason} onChange={(e) => setReason(e.target.value)} style={{ flex: 1 }} />
              </div>
              <div className="row" style={{ gap: 6 }}>
                <button className="btn primary sm" disabled={pending || newRating === v.riskRating || !reason.trim()} onClick={saveRisk}>{pending ? "Saving…" : "Save override"}</button>
                <button className="btn ghost sm" onClick={() => { setEditRisk(false); setReason(""); }}>Cancel</button>
              </div>
              <span className="cell-sub">Every override is logged: who, from, to, and why.</span>
            </div>
          )}
          {v.overrideHistory.length > 0 && (
            <div className="stack" style={{ gap: 8, marginTop: 10 }}>
              {v.overrideHistory.map((o, i) => (
                <div key={i} className="log-entry">
                  <span className="log-avatar">{initials(o.by)}</span>
                  <div className="cell-stack" style={{ flex: 1 }}>
                    <span>
                      <span className="cell-primary">{o.by}</span>{" "}
                      <span className="cell-sub">changed rating</span>{" "}
                      <span className="pill-transition"><Pill tone={RISK_TONE[o.from]} dot={false}>{o.from}</Pill><span className="arrow">→</span><Pill tone={RISK_TONE[o.to]} dot={false}>{o.to}</Pill></span>
                    </span>
                    <span className="cell-sub">{o.reason} · {o.at.slice(0, 10)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
          <ActionError result={result} />

          {/* Screen 4b — Provision Processor Portal Access (one login per vendor) */}
          <PortalAccess vendorId={v.id} portal={v.portal} scopeOptions={v.linkedProcessors} />

          {/* Purpose & PII mapping — editable by Legal/DPO */}
          <h3 className="drawer-section">Purpose &amp; PII mapping</h3>
          <PurposeMappings vendorId={v.id} mappings={v.mappings} purposes={purposes} canEdit={role === "legal" || role === "dpo"} />


          {/* DPA & contract */}
          <h3 className="drawer-section" style={focusDpa ? { outline: "2px solid var(--accent)", outlineOffset: 4, borderRadius: 4 } : undefined}>DPA &amp; contract</h3>
          {v.dpa.status === "not_on_file" ? (
            <Pill tone="gray">No DPA on file</Pill>
          ) : (
            <dl className="kv">
              <div style={{ display: "contents" }}><dt>Agreement</dt><dd>{v.dpa.name ?? "—"}</dd></div>
              <div style={{ display: "contents" }}><dt>Scope</dt><dd>{v.dpa.scope ?? "—"}</dd></div>
              <div style={{ display: "contents" }}><dt>Signed</dt><dd>{v.dpa.signedAt ?? "—"}</dd></div>
              <div style={{ display: "contents" }}><dt>Expiry</dt><dd><span className="row" style={{ gap: 6 }}>{v.dpa.expiresAt ?? "—"} <Pill tone={dpa.tone}>{dpa.text}</Pill></span></dd></div>
            </dl>
          )}

          {/* Screen 4a — Linked Processor Records (reverse visibility) */}
          <h3 className="drawer-section">Linked Processor Records ({v.linkedProcessors.length})</h3>
          {v.linkedProcessors.length === 0 ? (
            <p className="cell-sub" style={{ margin: 0 }}>No linked Processor records.</p>
          ) : (
            <div className="stack" style={{ gap: 6 }}>
              {v.linkedProcessors.map((p) => (
                <div key={p.id} className="row" style={{ justifyContent: "space-between" }}>
                  <Link href="/integrations/data-processors" className="row-link">{p.name}</Link>
                  <span className="cell-sub">{p.activity ?? "—"}</span>
                </div>
              ))}
              <span className="cell-sub">Offboarding this vendor affects the records above.</span>
            </div>
          )}

          {/* Related */}
          <h3 className="drawer-section">Related</h3>
          <div className="related-links">
            <Link href="/vendor-risk/assessments" className="related-link">Open this vendor&rsquo;s assessment →</Link>
            <Link href="/vendor-risk/sub-processors" className="related-link">View sub-processor disclosures →</Link>
          </div>
        </div>
      </aside>
    </div>
  );
}
