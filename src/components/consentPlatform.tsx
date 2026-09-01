"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Pill } from "@/components/ui";
import { ActionError } from "@/components/actions";
import {
  addWebhookAction,
  saveApiConfigAction,
  saveConsentRecordsAction,
  testWebhookAction,
  type DraftConsent,
} from "@/app/actions/consent";
import { WEBHOOK_EVENTS } from "@/lib/domain";
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

export function ApiConfigForm({
  apiEndpoint,
  brand,
  isolation,
  expiryMonths,
}: {
  apiEndpoint: string;
  brand: string;
  isolation: boolean;
  expiryMonths: number;
}) {
  const { pending, result, run } = useAction();
  const [endpoint, setEndpoint] = useState(apiEndpoint);
  const [b, setB] = useState(brand);
  const [iso, setIso] = useState(isolation);

  return (
    <div style={{ maxWidth: 560 }}>
      <div className="section-label">Universal Consent API endpoint</div>
      <input className="input" value={endpoint} onChange={(e) => setEndpoint(e.target.value)} placeholder="https://consent.example.in/api/v2" />

      <div className="section-label" style={{ marginTop: 12 }}>
        Preference Center branding
      </div>
      <input className="input" value={b} onChange={(e) => setB(e.target.value)} placeholder="Organisation name shown to data principals" />

      <label className="row" style={{ gap: 8, marginTop: 14 }}>
        <input type="checkbox" checked={iso} onChange={(e) => setIso(e.target.checked)} />
        <span>Isolate business units from one another</span>
      </label>
      <p className="cell-sub" style={{ margin: "4px 0 0 24px" }}>
        When on, one unit&apos;s consent records are not visible to another.
      </p>

      <div className="row" style={{ marginTop: 14 }}>
        <button
          className="btn primary"
          disabled={pending}
          onClick={() => run(() => saveApiConfigAction(endpoint, b, iso, expiryMonths))}
        >
          {pending ? "Saving…" : "Save configuration"}
        </button>
      </div>
      <ActionError result={result} />
    </div>
  );
}

/** Webhooks as a real table with an inline add row and a test action. */
export function WebhookTable({
  webhooks,
}: {
  webhooks: { id: string; endpoint: string; event: string; status: string; lastTestResult: string | null; lastTestAt: string | null }[];
}) {
  const { pending, result, run } = useAction();
  const [adding, setAdding] = useState(false);
  const [endpoint, setEndpoint] = useState("");
  const [event, setEvent] = useState(WEBHOOK_EVENTS[0]);

  return (
    <div>
      <div className="table-wrap">
        <table className="dtable">
          <thead>
            <tr>
              <th>Endpoint</th>
              <th>Event trigger</th>
              <th>Status</th>
              <th>Last test</th>
              <th style={{ width: 90 }} />
            </tr>
          </thead>
          <tbody>
            {adding && (
              <tr className="pa-unsaved">
                <td>
                  <input className="pa-input" placeholder="https://…" value={endpoint} onChange={(e) => setEndpoint(e.target.value)} />
                </td>
                <td>
                  <select className="pa-input" value={event} onChange={(e) => setEvent(e.target.value)}>
                    {WEBHOOK_EVENTS.map((ev) => (
                      <option key={ev} value={ev}>
                        {ev}
                      </option>
                    ))}
                  </select>
                </td>
                <td colSpan={2} className="cell-sub">Not yet saved</td>
                <td>
                  <button
                    className="btn xs primary"
                    disabled={pending || !endpoint.trim()}
                    onClick={() => run(() => addWebhookAction(endpoint, event), () => { setAdding(false); setEndpoint(""); })}
                  >
                    Save
                  </button>
                </td>
              </tr>
            )}
            {webhooks.map((w) => (
              <tr key={w.id}>
                <td className="mono cell-sub">{w.endpoint}</td>
                <td className="mono cell-sub">{w.event}</td>
                <td>
                  <Pill tone={w.status === "active" ? "green" : w.status === "failing" ? "red" : "gray"}>
                    {w.status}
                  </Pill>
                </td>
                <td className="cell-sub">
                  {w.lastTestResult ? `${w.lastTestResult} · ${w.lastTestAt}` : "never"}
                </td>
                <td>
                  <button className="btn xs" disabled={pending} onClick={() => run(() => testWebhookAction(w.id))}>
                    Test
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="row" style={{ marginTop: 10, justifyContent: "flex-end" }}>
        {!adding && (
          <button className="btn primary sm" onClick={() => setAdding(true)}>
            + Add webhook
          </button>
        )}
      </div>
      <ActionError result={result} />
    </div>
  );
}

export function ExpiryRuleBuilder({ months }: { months: number }) {
  const [value, setValue] = useState(months);
  return (
    <div>
      <p className="cell-sub" style={{ marginTop: 0 }}>
        Consent older than this is treated as expired and the data principal is
        re-prompted. Set on the Setup tab; shown here for reference.
      </p>
      <div className="row" style={{ gap: 8 }}>
        <input
          className="input"
          type="number"
          style={{ width: 90 }}
          value={value}
          onChange={(e) => setValue(Number(e.target.value))}
          disabled
        />
        <span className="cell-sub">months validity</span>
      </div>
    </div>
  );
}

/** Bulk consent import — same commit shape as Processing Activities. */
export function ConsentImport({ purposes }: { purposes: { id: string; name: string }[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [drafts, setDrafts] = useState<{ key: string; subjectRef: string; purposeTagId: string | null; error: string | null }[]>([]);
  const [summary, setSummary] = useState<{ saved: number; attempted: number; failed: number } | null>(null);
  const [csvError, setCsvError] = useState<string | null>(null);
  let seq = drafts.length;

  const parseCsv = (text: string) => {
    setCsvError(null);
    const lines = text.trim().split(/\r?\n/).filter(Boolean);
    if (lines.length < 2) {
      setCsvError("No data rows. Expected columns: subject_ref, purpose.");
      return;
    }
    const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
    if (!header.includes("subject_ref")) {
      setCsvError("Missing required column: subject_ref. Expected: subject_ref, purpose.");
      return;
    }
    const iRef = header.indexOf("subject_ref");
    const iPur = header.indexOf("purpose");
    const rows = lines.slice(1).map((line) => {
      const cells = line.split(",").map((c) => c.trim());
      const purposeName = iPur >= 0 ? cells[iPur] ?? "" : "";
      const match = purposes.find((p) => p.name.toLowerCase() === purposeName.toLowerCase());
      return {
        key: `c${seq++}`,
        subjectRef: cells[iRef] ?? "",
        purposeTagId: match?.id ?? null,
        error: null as string | null,
      };
    });
    setDrafts((d) => [...d, ...rows]);
  };

  const save = () => {
    start(async () => {
      const payload: DraftConsent[] = drafts.map((d) => ({
        subjectRef: d.subjectRef,
        purposeTagId: d.purposeTagId,
        channelOrigin: "bulk_import",
      }));
      const r = await saveConsentRecordsAction(payload);
      setSummary({ saved: r.savedIndexes.length, attempted: payload.length, failed: r.failed.length });
      const failedIdx = new Set(r.failed.map((f) => f.index));
      // Keep only failed rows, tagged with why — nothing silently lost.
      setDrafts((rows) =>
        rows
          .map((row, i) => ({ ...row, error: r.failed.find((f) => f.index === i)?.reason ?? null }))
          .filter((_, i) => failedIdx.has(i)),
      );
      router.refresh();
    });
  };

  return (
    <div>
      <p className="cell-sub" style={{ marginTop: 0 }}>
        Migrate legacy consent. Upload lands rows here as unsaved for review, the
        same table pattern as Processing Activities — nothing is committed until
        you save.
      </p>
      <div className="row" style={{ gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
        <a
          className="btn xs"
          download="consent-import-template.csv"
          href={`data:text/csv;charset=utf-8,${encodeURIComponent("subject_ref,purpose\nCUST-100001,Marketing communication\n")}`}
        >
          Download template
        </a>
        <input
          type="file"
          accept=".csv"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = () => parseCsv(String(reader.result ?? ""));
            reader.readAsText(file);
          }}
        />
      </div>

      {csvError && (
        <div className="notice danger compact" style={{ marginBottom: 10 }}>
          <span>{csvError}</span>
        </div>
      )}

      {drafts.length > 0 && (
        <>
          <div className="table-wrap">
            <table className="dtable">
              <thead>
                <tr>
                  <th>Subject reference</th>
                  <th>Purpose</th>
                  <th style={{ width: 40 }} />
                </tr>
              </thead>
              <tbody>
                {drafts.map((d) => (
                  <tr key={d.key} className="pa-unsaved">
                    <td>
                      <input
                        className="pa-input"
                        value={d.subjectRef}
                        onChange={(e) => setDrafts((rows) => rows.map((r) => (r.key === d.key ? { ...r, subjectRef: e.target.value } : r)))}
                      />
                      {d.error && <div className="cell-sub" style={{ color: "var(--red)" }}>{d.error}</div>}
                    </td>
                    <td>
                      <select
                        className="pa-input"
                        value={d.purposeTagId ?? ""}
                        onChange={(e) => setDrafts((rows) => rows.map((r) => (r.key === d.key ? { ...r, purposeTagId: e.target.value || null } : r)))}
                      >
                        <option value="">— none —</option>
                        {purposes.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <button className="icon-btn" aria-label="Remove" onClick={() => setDrafts((rows) => rows.filter((r) => r.key !== d.key))}>
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="row" style={{ marginTop: 12, justifyContent: "space-between" }}>
            <span className="cell-sub">{drafts.length} unsaved</span>
            <div className="row" style={{ gap: 8 }}>
              <button className="btn ghost" onClick={() => setDrafts([])} disabled={pending}>
                Discard
              </button>
              <button className="btn primary" onClick={save} disabled={pending}>
                {pending ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </>
      )}

      {summary && (
        <div className={`notice `} style={{ marginTop: 10 }}>
          <div className="notice-title">
            {summary.saved} of {summary.attempted} saved{summary.failed ? ` ·  failed` : ""}
          </div>
        </div>
      )}
    </div>
  );
}
