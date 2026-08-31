"use client";

import { useState } from "react";
import { InfoTip, Pill } from "@/components/ui";

const TEMPLATE_COLUMNS = ["field_path", "source", "category", "sensitivity", "purpose", "subject_type"];

const CATEGORIES = [
  "identity", "contact", "kyc", "financial", "transaction",
  "marketing", "behavioural", "support",
];

interface ParsedRow {
  line: number;
  cells: Record<string, string>;
  errors: { column: string; reason: string }[];
  unmappedCategory: string | null;
}

/**
 * CSV import: template → upload → map → preview → commit.
 *
 * Validation reports at ROW level. "Import failed" over a 400-row file tells
 * the operator nothing they can act on; which rows, which columns, and why is
 * the difference between a fixable problem and a dead end.
 */
export function ImportWizard() {
  const [step, setStep] = useState<"upload" | "map" | "preview">("upload");
  const [raw, setRaw] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [newCategories, setNewCategories] = useState<Record<string, string>>({});

  const templateCsv = `${TEMPLATE_COLUMNS.join(",")}\ncustomer.email,Core Banking DB,contact,medium,Account servicing,customer\n`;

  const parse = () => {
    const lines = raw.trim().split(/\r?\n/).filter(Boolean);
    if (lines.length === 0) return;
    const hdr = lines[0].split(",").map((h) => h.trim());
    setHeaders(hdr);
    const initial: Record<string, string> = {};
    for (const col of TEMPLATE_COLUMNS) {
      const match = hdr.find((h) => h.toLowerCase() === col);
      if (match) initial[col] = match;
    }
    setMapping(initial);
    setStep("map");
  };

  const buildPreview = () => {
    const lines = raw.trim().split(/\r?\n/).filter(Boolean).slice(1);
    const parsed: ParsedRow[] = lines.map((line, i) => {
      const values = line.split(",").map((v) => v.trim());
      const cells: Record<string, string> = {};
      for (const [target, sourceCol] of Object.entries(mapping)) {
        const idx = headers.indexOf(sourceCol);
        cells[target] = idx >= 0 ? (values[idx] ?? "") : "";
      }

      const errors: { column: string; reason: string }[] = [];
      if (!cells.field_path) errors.push({ column: "field_path", reason: "Required — this is the field's identifier." });
      if (!cells.source) errors.push({ column: "source", reason: "Required — which source holds this field." });
      if (cells.sensitivity && !["high", "medium", "low"].includes(cells.sensitivity.toLowerCase())) {
        errors.push({ column: "sensitivity", reason: `"${cells.sensitivity}" is not high, medium or low.` });
      }

      // A category outside the taxonomy is flagged for a decision, never
      // silently dropped and never forced into the nearest wrong bucket.
      const unmappedCategory =
        cells.category && !CATEGORIES.includes(cells.category.toLowerCase())
          ? cells.category
          : null;

      return { line: i + 2, cells, errors, unmappedCategory };
    });
    setRows(parsed);
    setStep("preview");
  };

  const badRows = rows.filter((r) => r.errors.length > 0);
  const unmapped = rows.filter((r) => r.unmappedCategory && !newCategories[r.unmappedCategory]);
  const okRows = rows.filter((r) => r.errors.length === 0);

  return (
    <div>
      <div className="row" style={{ gap: 6, marginBottom: 14 }}>
        {(["upload", "map", "preview"] as const).map((s, i) => (
          <Pill key={s} tone={step === s ? "orange" : "gray"}>
            {i + 1}. {s}
          </Pill>
        ))}
      </div>

      {step === "upload" && (
        <div>
          <div className="section-label">1 — Download the template</div>
          <a
            className="btn sm"
            download="inventory-template.csv"
            href={`data:text/csv;charset=utf-8,${encodeURIComponent(templateCsv)}`}
          >
            Download template CSV
          </a>

          <div className="section-label" style={{ marginTop: 16 }}>
            2 — Paste the filled CSV
          </div>
          <textarea
            className="input"
            rows={8}
            style={{ fontFamily: "var(--font-mono)", fontSize: 12.5 }}
            placeholder={templateCsv}
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
          />
          <div className="row" style={{ marginTop: 10 }}>
            <button className="btn primary" disabled={!raw.trim()} onClick={parse}>
              Continue to mapping
            </button>
          </div>
        </div>
      )}

      {step === "map" && (
        <div>
          <p className="cell-sub" style={{ marginTop: 0 }}>
            Match your columns to the inventory fields. Anything left unmapped is
            simply not imported — it is not guessed at.
          </p>
          <div className="stack" style={{ gap: 10 }}>
            {TEMPLATE_COLUMNS.map((col) => (
              <div key={col} className="row" style={{ gap: 10 }}>
                <span style={{ minWidth: 130, fontWeight: 500 }}>{col}</span>
                <select
                  className="input sm"
                  value={mapping[col] ?? ""}
                  onChange={(e) => setMapping((m) => ({ ...m, [col]: e.target.value }))}
                >
                  <option value="">— not mapped —</option>
                  {headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          <div className="row" style={{ marginTop: 14, gap: 8 }}>
            <button className="btn primary" onClick={buildPreview}>
              Preview
            </button>
            <button className="btn ghost" onClick={() => setStep("upload")}>
              Back
            </button>
          </div>
        </div>
      )}

      {step === "preview" && (
        <div>
          <div className="row" style={{ gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
            <Pill tone="green">{okRows.length} ready</Pill>
            {badRows.length > 0 && <Pill tone="red">{badRows.length} with errors</Pill>}
            {unmapped.length > 0 && <Pill tone="yellow">{unmapped.length} unknown category</Pill>}
          </div>

          {badRows.length > 0 && (
            <div className="notice danger" style={{ marginBottom: 12 }}>
              <div className="notice-title">
                {badRows.length} row{badRows.length === 1 ? "" : "s"} cannot be imported
              </div>
              <div>
                <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                  {badRows.slice(0, 10).map((r) => (
                    <li key={r.line} style={{ marginBottom: 3 }}>
                      <strong>Row {r.line}</strong> —{" "}
                      {r.errors.map((e) => `${e.column}: ${e.reason}`).join(" · ")}
                    </li>
                  ))}
                </ul>
                {badRows.length > 10 && (
                  <p className="cell-sub" style={{ margin: "6px 0 0" }}>
                    …and {badRows.length - 10} more.
                  </p>
                )}
                <p style={{ margin: "8px 0 0" }}>
                  Fix these rows in your file and re-upload. The valid rows can be
                  imported now without waiting.
                </p>
              </div>
            </div>
          )}

          {unmapped.length > 0 && (
            <div className="notice warn" style={{ marginBottom: 12 }}>
              <div className="notice-title">
                Categories not in the approved taxonomy
              </div>
              <div>
                These are not dropped and not forced into the nearest match.
                Assign each to an approved category, or request a new one from the
                DPO.
                <div className="stack" style={{ gap: 8, marginTop: 10 }}>
                  {[...new Set(unmapped.map((r) => r.unmappedCategory!))].map((cat) => (
                    <div key={cat} className="row" style={{ gap: 8 }}>
                      <code className="field-chip">{cat}</code>
                      <span className="cell-sub">→</span>
                      <select
                        className="input sm"
                        value={newCategories[cat] ?? ""}
                        onChange={(e) =>
                          setNewCategories((c) => ({ ...c, [cat]: e.target.value }))
                        }
                      >
                        <option value="">— choose —</option>
                        {CATEGORIES.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                        <option value="__request">Request a new category from the DPO</option>
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="table-wrap">
            <table className="dtable">
              <thead>
                <tr>
                  <th>Row</th>
                  {TEMPLATE_COLUMNS.map((c) => (
                    <th key={c}>{c}</th>
                  ))}
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 50).map((r) => (
                  <tr key={r.line}>
                    <td className="cell-sub">{r.line}</td>
                    {TEMPLATE_COLUMNS.map((c) => (
                      <td key={c} className="cell-sub mono">
                        {r.cells[c] || "—"}
                      </td>
                    ))}
                    <td>
                      {r.errors.length > 0 ? (
                        <span className="row" style={{ gap: 5 }}>
                          <Pill tone="red">Error</Pill>
                          <InfoTip
                            align="left"
                            text={r.errors.map((e) => `${e.column}: ${e.reason}`).join(" · ")}
                          />
                        </span>
                      ) : r.unmappedCategory ? (
                        <Pill tone="yellow">Needs category</Pill>
                      ) : (
                        <Pill tone="green">Ready</Pill>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="row" style={{ marginTop: 14, gap: 8 }}>
            <button className="btn primary" disabled={okRows.length === 0}>
              Import {okRows.length} row{okRows.length === 1 ? "" : "s"}
            </button>
            <button className="btn ghost" onClick={() => setStep("map")}>
              Back to mapping
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Guided questionnaire for scoping an activity that has no system yet.
 */
export function GuidedQuestionnaire() {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});

  const QUESTIONS = [
    {
      key: "activity",
      label: "What is the activity?",
      hint: "The business initiative, not the system. e.g. \"Pre-approved loan offers to existing customers\".",
      placeholder: "Name the initiative",
    },
    {
      key: "data",
      label: "What personal data does it touch?",
      hint: "List what will be collected or used. Rough is fine — this is a scoping pass.",
      placeholder: "e.g. name, mobile, account balance, repayment history",
    },
    {
      key: "subject",
      label: "Whose data is it?",
      hint: "Customers, employees, vendors — and whether any of them may be children.",
      placeholder: "e.g. existing retail customers",
    },
    {
      key: "purpose",
      label: "Under which approved purpose?",
      hint: "Must be a purpose the DPO has approved. If none fits, that is itself the finding.",
      placeholder: "e.g. Marketing communication",
    },
  ];

  const q = QUESTIONS[step];
  const done = step >= QUESTIONS.length;

  if (done) {
    return (
      <div>
        <div className="notice ok" style={{ marginBottom: 14 }}>
          <div className="notice-title">Scoping recorded</div>
          <div>
            This activity is now on the record before it starts processing
            anything, which is the point of doing it here rather than after.
          </div>
        </div>
        <dl className="kv">
          {QUESTIONS.map((question) => (
            <div key={question.key} style={{ display: "contents" }}>
              <dt>{question.label}</dt>
              <dd>{answers[question.key] || <span className="muted">Not answered</span>}</dd>
            </div>
          ))}
        </dl>
        <div className="row" style={{ marginTop: 14 }}>
          <button className="btn" onClick={() => { setStep(0); setAnswers({}); }}>
            Start another
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="row" style={{ gap: 6, marginBottom: 14 }}>
        {QUESTIONS.map((question, i) => (
          <Pill key={question.key} tone={i === step ? "orange" : i < step ? "green" : "gray"}>
            {i + 1}
          </Pill>
        ))}
      </div>

      <div className="section-label" style={{ display: "flex", alignItems: "center", gap: 6 }}>
        {q.label}
        <InfoTip align="left" text={q.hint} />
      </div>
      <input
        className="input"
        placeholder={q.placeholder}
        value={answers[q.key] ?? ""}
        onChange={(e) => setAnswers((a) => ({ ...a, [q.key]: e.target.value }))}
      />

      <div className="row" style={{ marginTop: 14, gap: 8 }}>
        {step > 0 && (
          <button className="btn ghost" onClick={() => setStep((s) => s - 1)}>
            Back
          </button>
        )}
        <button
          className="btn primary"
          disabled={!answers[q.key]?.trim()}
          onClick={() => setStep((s) => s + 1)}
        >
          {step === QUESTIONS.length - 1 ? "Finish" : "Next"}
        </button>
      </div>
    </div>
  );
}
