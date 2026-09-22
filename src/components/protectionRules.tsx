"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";
import { ListDetail, type Column } from "@/components/ListDetail";
import { Notice, Pill } from "@/components/ui";
import { ActionError } from "@/components/actions";
import {
  requestExceptionAction,
  requestRuleAction,
  saveRuleScopeAction,
} from "@/app/actions/dataflow";
import type { ActionResult } from "@/app/actions/requests";
import type { PillTone } from "@/components/ui";

export interface RuleRow {
  id: string;
  ruleName: string;
  dataCategory: string;
  ruleType: string;
  strictness: string;
  definition: string;
  setBy: string;
  scopedSystemIds: string[];
  /** Field-level narrowing per scoped system: { [systemId]: categories }. A
   *  system absent here (or empty) means the rule covers all its fields. */
  scopedFields: Record<string, string[]>;
  status: "implemented" | "needs_scope" | "exception_active";
  exceptions: { process: string; narrowedScope: string }[];
  pendingException: boolean;
}

const STATUS: Record<RuleRow["status"], { label: string; tone: PillTone }> = {
  implemented: { label: "Implemented", tone: "green" },
  needs_scope: { label: "Needs scope", tone: "yellow" },
  exception_active: { label: "Exception active", tone: "purple" },
};

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

/** A small lock marker for the CISO-owned columns. */
function Locked({ children }: { children: React.ReactNode }) {
  return (
    <span className="locked-cell" title="Set by the CISO">
      <Lock size={11} />
      {children}
    </span>
  );
}

export function ProtectionRulesTable({
  rows,
  systems,
  systemCategories = {},
}: {
  rows: RuleRow[];
  systems: { id: string; name: string }[];
  systemCategories?: Record<string, string[]>;
}) {
  const { pending, result, run } = useAction();
  const [requestingRule, setRequestingRule] = useState(false);

  const columns: Column<RuleRow>[] = [
    {
      key: "name",
      header: "Rule name",
      render: (r) => <Locked>{r.ruleName}</Locked>,
    },
    {
      key: "cat",
      header: "Category",
      width: 110,
      render: (r) => <Locked>{r.dataCategory}</Locked>,
    },
    {
      key: "type",
      header: "Type",
      width: 90,
      render: (r) => <Locked>{r.ruleType}</Locked>,
    },
    {
      key: "strict",
      header: "Strictness",
      width: 100,
      render: (r) => <Locked>{r.strictness}</Locked>,
    },
    {
      key: "scope",
      header: "Scope",
      render: (r) => (
        // The one column Admin owns — normal weight, actionable.
        <span className="cell-primary">
          {r.scopedSystemIds.length
            ? `${r.scopedSystemIds.length} system${r.scopedSystemIds.length === 1 ? "" : "s"}`
            : "Not set"}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      width: 130,
      render: (r) => <Pill tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Pill>,
    },
  ];

  return (
    <div>
      <ListDetail<RuleRow>
        items={rows}
        columns={columns}
        emptyLabel="No protection rules match this view."
        detailEmptyLabel="Select a rule to set its scope."
        renderDetail={(r) => (
          <RuleDrawer
            key={r.id}
            rule={r}
            systems={systems}
            systemCategories={systemCategories}
            pending={pending}
            onSaveScope={(ids, fields) => run(() => saveRuleScopeAction(r.id, ids, fields))}
            onRequestException={(process, reason, narrowed) =>
              run(() => requestExceptionAction(r.id, r.ruleName, process, reason, narrowed))
            }
          />
        )}
      />

      {/* The only path to a new rule — above the fold, not buried. No add button. */}
      <div className="row" style={{ marginTop: 12 }}>
        <button className="btn sm" onClick={() => setRequestingRule((v) => !v)}>
          Request a new protection rule →
        </button>
      </div>

      {requestingRule && (
        <RequestRuleForm pending={pending} onRequest={(cat, reason) => run(() => requestRuleAction(cat, reason), () => setRequestingRule(false))} />
      )}

      <ActionError result={result} />
    </div>
  );
}

function RuleDrawer({
  rule,
  systems,
  systemCategories = {},
  pending,
  onSaveScope,
  onRequestException,
}: {
  rule: RuleRow;
  systems: { id: string; name: string }[];
  systemCategories?: Record<string, string[]>;
  pending: boolean;
  onSaveScope: (ids: string[], fields: Record<string, string[]>) => void;
  onRequestException: (process: string, reason: string, narrowed: string) => void;
}) {
  const [scope, setScope] = useState<string[]>(rule.scopedSystemIds);
  const [fields, setFields] = useState<Record<string, string[]>>(rule.scopedFields ?? {});
  const [reqExc, setReqExc] = useState(false);
  const [process, setProcess] = useState("");
  const [reason, setReason] = useState("");
  const [narrowed, setNarrowed] = useState("");

  const toggle = (id: string) => setScope((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  // Toggle one data category (field) within a system. Empty selection for a
  // system means "all fields" — the zero-config default — so we drop the key.
  const toggleField = (systemId: string, cat: string) =>
    setFields((f) => {
      const cur = f[systemId] ?? [];
      const next = cur.includes(cat) ? cur.filter((c) => c !== cat) : [...cur, cat];
      const copy = { ...f };
      if (next.length === 0) delete copy[systemId];
      else copy[systemId] = next;
      return copy;
    });

  return (
    <div className="stack" style={{ gap: 14 }}>
      <div>
        <div className="row" style={{ gap: 6 }}>
          <Lock size={12} />
          <h3 style={{ margin: 0, fontSize: 15 }}>{rule.ruleName}</h3>
        </div>
        <div className="cell-sub">Set by {rule.setBy}</div>
      </div>

      <div className="notice policy compact">
        <span>
          Definition is read-only. {rule.dataCategory} · {rule.ruleType} ·{" "}
          {rule.strictness} strictness. {rule.definition}
        </span>
      </div>

      <div>
        <div className="section-label">Scope — which systems &amp; fields this rule applies to</div>
        <div className="stack" style={{ gap: 4 }}>
          {systems.map((s) => {
            const checked = scope.includes(s.id);
            const cats = systemCategories[s.id] ?? [];
            const sel = fields[s.id] ?? [];
            return (
              <div key={s.id}>
                <label className="row" style={{ gap: 8 }}>
                  <input type="checkbox" checked={checked} onChange={() => toggle(s.id)} />
                  <span>{s.name}</span>
                </label>
                {/* Field-level narrowing appears only for a scoped system that has
                    known data categories; none selected = all fields. */}
                {checked && cats.length > 0 && (
                  <div className="row" style={{ gap: 6, flexWrap: "wrap", margin: "4px 0 6px 26px" }}>
                    <span className="cell-sub" style={{ marginRight: 2 }}>Fields:</span>
                    {cats.map((c) => {
                      const on = sel.includes(c);
                      return (
                        <button
                          key={c}
                          type="button"
                          className={`chip${on ? " on" : ""}`}
                          onClick={() => toggleField(s.id, c)}
                          title={on ? "Applied to this field" : "Click to narrow the rule to this field"}
                        >
                          {c}
                        </button>
                      );
                    })}
                    <span className="cell-sub">{sel.length === 0 ? "all fields" : `${sel.length} field${sel.length === 1 ? "" : "s"}`}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {(() => {
          // Flag any configured system that does not hold the rule's data
          // category — a possible deviation from CISO's written specification.
          const mismatched = scope
            .map((id) => ({ id, cats: systemCategories[id] }))
            .filter((s) => s.cats && s.cats.length > 0 && !s.cats.includes(rule.dataCategory))
            .map((s) => systems.find((y) => y.id === s.id)?.name ?? s.id);
          return mismatched.length > 0 ? (
            <div className="notice warn compact" style={{ marginTop: 10 }}>
              <span>
                Scope may deviate from CISO&apos;s specification: {mismatched.join(", ")} do not hold{" "}
                <strong>{rule.dataCategory}</strong> data. Confirm this is intended before saving — the
                mismatch is flagged, not blocked.
              </span>
            </div>
          ) : null;
        })()}
        <div className="row" style={{ marginTop: 10 }}>
          <button className="btn primary sm" disabled={pending} onClick={() => onSaveScope(scope, fields)}>
            {pending ? "Saving…" : "Save scope"}
          </button>
          {rule.status === "needs_scope" && <Pill tone="yellow">Needs scope</Pill>}
        </div>
      </div>

      {rule.exceptions.length > 0 && (
        <div>
          <div className="section-label">Active exceptions</div>
          {rule.exceptions.map((e, i) => (
            <div key={i} className="notice info compact" style={{ marginBottom: 6 }}>
              <span>
                <strong>{e.process}</strong> — {e.narrowedScope}
              </span>
            </div>
          ))}
        </div>
      )}

      {rule.pendingException ? (
        <Notice tone="warn" title="Exception requested — awaiting CISO review">
          The CISO owns this decision. Nothing changes until they rule.
        </Notice>
      ) : reqExc ? (
        <div className="stack" style={{ gap: 8 }}>
          <div className="section-label">Request an exception</div>
          <input className="input sm" placeholder="Which process is blocked?" value={process} onChange={(e) => setProcess(e.target.value)} />
          <textarea className="input sm" rows={2} placeholder="Why is an exception needed?" value={reason} onChange={(e) => setReason(e.target.value)} />
          <input className="input sm" placeholder="Proposed narrower scope" value={narrowed} onChange={(e) => setNarrowed(e.target.value)} />
          <div className="row" style={{ gap: 6 }}>
            <button className="btn primary sm" disabled={pending || !process.trim()} onClick={() => onRequestException(process, reason, narrowed)}>
              Submit to CISO
            </button>
            <button className="btn ghost sm" onClick={() => setReqExc(false)}>Cancel</button>
          </div>
        </div>
      ) : (
        <button className="btn sm" onClick={() => setReqExc(true)}>
          Request exception
        </button>
      )}
    </div>
  );
}

function RequestRuleForm({
  pending,
  onRequest,
}: {
  pending: boolean;
  onRequest: (category: string, reason: string) => void;
}) {
  const [cat, setCat] = useState("kyc");
  const [reason, setReason] = useState("");
  return (
    <div className="notice info" style={{ marginTop: 10 }}>
      <div className="notice-title">Request a new protection rule from the CISO</div>
      <p className="cell-sub" style={{ margin: "0 0 8px" }}>
        Admin cannot create a rule. This raises an escalation to the CISO, who
        owns the definition — the only way a new rule comes to exist.
      </p>
      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
        <select className="input sm" value={cat} onChange={(e) => setCat(e.target.value)}>
          {["identity", "contact", "kyc", "financial", "transaction", "marketing", "behavioural", "support"].map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <input className="input sm" style={{ minWidth: 240 }} placeholder="Why is it needed?" value={reason} onChange={(e) => setReason(e.target.value)} />
        <button className="btn primary sm" disabled={pending || !reason.trim()} onClick={() => onRequest(cat, reason)}>
          Raise request
        </button>
      </div>
    </div>
  );
}
