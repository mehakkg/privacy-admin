"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Upload, X } from "lucide-react";
import { InfoTip, Pill } from "@/components/ui";
import {
  deleteActivityAction,
  saveActivitiesAction,
  type DraftActivity,
} from "@/app/actions/discovery";

export interface SavedActivity {
  id: string;
  activity: string;
  purposeTagId: string | null;
  purposeName: string | null;
  subjectType: string | null;
  dataElements: string[];
  origin: string;
}

interface DraftRow extends DraftActivity {
  key: string;
  /** Set after a failed save so the row shows why it did not commit. */
  error: string | null;
}

const SUBJECT_TYPES = ["customer", "employee", "vendor", "minor"];
const PAGE_SIZE = 50;

let seq = 0;
const nextKey = () => `d${seq++}`;

/**
 * PROCESSING ACTIVITIES — one editable table.
 *
 * Activity, Purpose, Data elements and Subject type are columns of one record,
 * not steps in a conversation, so this is a table rather than a wizard. Manual
 * "Add row" and CSV import land in the SAME unsaved state with the same
 * rendering — the questionnaire-vs-CSV split was always two ways of getting
 * rows into one record, not two products.
 */
export function ProcessingActivitiesTable({
  saved,
  purposes,
  inventoryFields,
}: {
  saved: SavedActivity[];
  purposes: { id: string; name: string }[];
  /** Field names from the Data Inventory, for tag matching. */
  inventoryFields: string[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [drafts, setDrafts] = useState<DraftRow[]>([]);
  const [page, setPage] = useState(0);
  const [csvError, setCsvError] = useState<string | null>(null);
  const [showCsv, setShowCsv] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const inventorySet = useMemo(
    () => new Set(inventoryFields.map((f) => f.toLowerCase())),
    [inventoryFields],
  );
  const purposeById = useMemo(
    () => new Map(purposes.map((p) => [p.id, p.name])),
    [purposes],
  );

  const patch = (key: string, next: Partial<DraftRow>) =>
    setDrafts((rows) => rows.map((r) => (r.key === key ? { ...r, ...next } : r)));

  const addRow = () =>
    setDrafts((rows) => [
      ...rows,
      {
        key: nextKey(),
        activity: "",
        purposeTagId: null,
        subjectType: null,
        dataElements: [],
        origin: "manual",
        error: null,
      },
    ]);

  const discard = () => {
    setDrafts([]);
    setCsvError(null);
    setPage(0);
  };

  const save = () => {
    start(async () => {
      const payload: DraftActivity[] = drafts.map((d) => ({
        activity: d.activity,
        purposeTagId: d.purposeTagId,
        subjectType: d.subjectType,
        dataElements: d.dataElements,
        origin: d.origin,
      }));
      const result = await saveActivitiesAction(payload);
      // Keep only the rows that failed, tagged with their reason, so nothing is
      // lost and it is clear which ones did not commit.
      const failedByIndex = new Map(result.failed.map((f) => [f.index, f.reason]));
      setDrafts((rows) =>
        rows
          .map((r, i) => ({ ...r, error: failedByIndex.get(i) ?? null }))
          .filter((_, i) => failedByIndex.has(i)),
      );
      router.refresh();
    });
  };

  const removeSaved = (id: string) => {
    start(async () => {
      await deleteActivityAction(id);
      router.refresh();
    });
  };

  // --- CSV -----------------------------------------------------------------
  const parseCsv = (text: string) => {
    setCsvError(null);
    const lines = text.trim().split(/\r?\n/).filter(Boolean);
    if (lines.length < 2) {
      setCsvError(
        "The file has no data rows. Expected columns: activity, purpose, data_elements, subject_type. Download the template below.",
      );
      return;
    }
    const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
    const required = ["activity", "purpose"];
    const missing = required.filter((c) => !header.includes(c));
    if (missing.length) {
      setCsvError(
        `Missing required column(s): ${missing.join(", ")}. Expected: activity, purpose, data_elements, subject_type. Download the template below.`,
      );
      return;
    }
    const idx = (c: string) => header.indexOf(c);

    const parsed: DraftRow[] = lines.slice(1).map((line) => {
      const cells = line.split(",").map((c) => c.trim());
      const rawPurpose = idx("purpose") >= 0 ? cells[idx("purpose")] ?? "" : "";
      // Match the purpose against the approved taxonomy; leave empty (and let
      // the row show a warning) rather than force a wrong match.
      const match = purposes.find(
        (p) => p.name.toLowerCase() === rawPurpose.toLowerCase(),
      );
      const elements =
        idx("data_elements") >= 0
          ? (cells[idx("data_elements")] ?? "")
              .split(/[;|]/)
              .map((t) => t.trim())
              .filter(Boolean)
          : [];
      const subj =
        idx("subject_type") >= 0 ? (cells[idx("subject_type")] ?? "").toLowerCase() : "";

      return {
        key: nextKey(),
        activity: idx("activity") >= 0 ? cells[idx("activity")] ?? "" : "",
        purposeTagId: match?.id ?? null,
        subjectType: SUBJECT_TYPES.includes(subj) ? subj : null,
        dataElements: elements,
        origin: "csv",
        error: null,
      };
    });

    setDrafts((rows) => [...rows, ...parsed]);
    setShowCsv(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  const templateCsv =
    "activity,purpose,data_elements,subject_type\nPre-approved loan offers,Marketing communication,name;mobile;account_balance,customer\n";

  // --- pagination over unsaved rows ---------------------------------------
  const pages = Math.max(1, Math.ceil(drafts.length / PAGE_SIZE));
  const pageDrafts =
    drafts.length > PAGE_SIZE ? drafts.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE) : drafts;

  const unsavedCount = drafts.length;

  return (
    <div>
      <div className="row" style={{ justifyContent: "flex-end", marginBottom: 12, gap: 8 }}>
        <button className="btn sm" onClick={() => setShowCsv((s) => !s)}>
          <Upload size={13} /> Import CSV
        </button>
        <button className="btn primary sm" onClick={addRow}>
          Add row
        </button>
      </div>

      {showCsv && (
        <div className="notice info" style={{ marginBottom: 12 }}>
          <div className="notice-title">Import CSV</div>
          <div className="row" style={{ gap: 10, marginTop: 6, flexWrap: "wrap" }}>
            <a
              className="btn xs"
              download="processing-activities-template.csv"
              href={`data:text/csv;charset=utf-8,${encodeURIComponent(templateCsv)}`}
            >
              Download template
            </a>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = () => parseCsv(String(reader.result ?? ""));
                reader.onerror = () =>
                  setCsvError("The file could not be read. Save it as UTF-8 CSV and try again.");
                reader.readAsText(file);
              }}
            />
          </div>
          <p className="cell-sub" style={{ margin: "8px 0 0" }}>
            Rows land in the table below as unsaved. Review and fix them there
            before saving — nothing is committed on upload.
          </p>
        </div>
      )}

      {csvError && (
        <div className="notice danger" style={{ marginBottom: 12 }}>
          <div className="notice-title">CSV could not be imported</div>
          <div>{csvError}</div>
        </div>
      )}

      <div className="table-wrap">
        <table className="dtable">
          <thead>
            <tr>
              <th style={{ width: "26%" }}>Activity</th>
              <th style={{ width: "20%" }}>Purpose</th>
              <th style={{ width: "30%" }}>Data elements</th>
              <th style={{ width: "16%" }}>Subject type</th>
              <th style={{ width: 40 }} />
            </tr>
          </thead>
          <tbody>
            {pageDrafts.map((row) => (
              <tr key={row.key} className="pa-unsaved">
                <td>
                  <input
                    className="pa-input"
                    placeholder="Activity name"
                    value={row.activity}
                    onChange={(e) => patch(row.key, { activity: e.target.value })}
                  />
                  {row.error && (
                    <div className="cell-sub" style={{ color: "var(--red)" }}>
                      {row.error}
                    </div>
                  )}
                </td>
                <td>
                  <select
                    className="pa-input"
                    value={row.purposeTagId ?? ""}
                    onChange={(e) => patch(row.key, { purposeTagId: e.target.value || null })}
                  >
                    <option value="">— assign —</option>
                    {purposes.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  {!row.purposeTagId && (
                    <span className="row" style={{ gap: 4, marginTop: 3 }}>
                      <Pill tone="yellow">No purpose</Pill>
                      <InfoTip
                        align="left"
                        text="Only DPO-approved purposes can be assigned, and a row cannot be saved without one. A CSV purpose that did not match the taxonomy is left empty here for you to set."
                      />
                    </span>
                  )}
                </td>
                <td>
                  <TagInput
                    tags={row.dataElements}
                    inventorySet={inventorySet}
                    suggestions={inventoryFields}
                    onChange={(tags) => patch(row.key, { dataElements: tags })}
                  />
                </td>
                <td>
                  <select
                    className="pa-input"
                    value={row.subjectType ?? ""}
                    onChange={(e) => patch(row.key, { subjectType: e.target.value || null })}
                  >
                    <option value="">—</option>
                    {SUBJECT_TYPES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <button
                    className="icon-btn"
                    aria-label="Delete row"
                    onClick={() => setDrafts((rows) => rows.filter((r) => r.key !== row.key))}
                  >
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}

            {saved.map((row) => (
              <tr key={row.id}>
                <td className="cell-primary">{row.activity}</td>
                <td>
                  {row.purposeName ? (
                    <span className="cell-sub">{row.purposeName}</span>
                  ) : (
                    <Pill tone="yellow">No purpose</Pill>
                  )}
                </td>
                <td>
                  <div className="row" style={{ gap: 4, flexWrap: "wrap" }}>
                    {row.dataElements.length === 0 && <span className="muted">—</span>}
                    {row.dataElements.map((t) => {
                      const linked = inventorySet.has(t.toLowerCase());
                      return (
                        <span
                          key={t}
                          className={`pa-tag${linked ? "" : " unlinked"}`}
                          title={linked ? "Linked to an inventory field" : "Not yet in inventory"}
                        >
                          {t}
                        </span>
                      );
                    })}
                  </div>
                </td>
                <td className="cell-sub">{row.subjectType ?? "—"}</td>
                <td>
                  <button
                    className="icon-btn"
                    aria-label="Delete activity"
                    disabled={pending}
                    onClick={() => removeSaved(row.id)}
                  >
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}

            {saved.length === 0 && drafts.length === 0 && (
              <tr>
                <td colSpan={5}>
                  <div className="empty">
                    <p style={{ margin: "0 0 10px" }}>
                      No processing activities recorded yet. Add a row, or import
                      a CSV.
                    </p>
                    <button className="btn primary sm" onClick={addRow}>
                      Add row
                    </button>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {drafts.length > PAGE_SIZE && (
        <div className="row" style={{ marginTop: 10, gap: 8 }}>
          <span className="cell-sub">
            Unsaved page {page + 1} of {pages}
          </span>
          <button className="btn xs" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
            Previous
          </button>
          <button
            className="btn xs"
            disabled={page >= pages - 1}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </button>
        </div>
      )}

      <div className="row" style={{ marginTop: 14, justifyContent: "space-between" }}>
        <span className="cell-sub">
          {saved.length} activit{saved.length === 1 ? "y" : "ies"}
          {unsavedCount > 0 && ` · ${unsavedCount} unsaved row${unsavedCount === 1 ? "" : "s"}`}
        </span>
        {unsavedCount > 0 && (
          <div className="row" style={{ gap: 8 }}>
            <button className="btn ghost" disabled={pending} onClick={discard}>
              Discard
            </button>
            <button className="btn primary" disabled={pending} onClick={save}>
              {pending ? "Saving…" : "Save to inventory"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Tag input. Matches each tag against the Data Inventory field names and flags
 * anything unmatched as "not yet in inventory" — a free-text tag is allowed,
 * but the operator can see it is not linked to a scanned field.
 */
function TagInput({
  tags,
  inventorySet,
  suggestions,
  onChange,
}: {
  tags: string[];
  inventorySet: Set<string>;
  suggestions: string[];
  onChange: (tags: string[]) => void;
}) {
  const [value, setValue] = useState("");
  const listId = useMemo(() => `inv-${Math.round(Math.random() * 1e6)}`, []);

  const add = (t: string) => {
    const tag = t.trim();
    if (tag && !tags.includes(tag)) onChange([...tags, tag]);
    setValue("");
  };

  return (
    <div className="pa-tags">
      {tags.map((t) => {
        const linked = inventorySet.has(t.toLowerCase());
        return (
          <span key={t} className={`pa-tag${linked ? "" : " unlinked"}`}>
            {t}
            {!linked && <span className="pa-tag-note" title="Not yet in inventory">•</span>}
            <button
              type="button"
              aria-label={`Remove ${t}`}
              onClick={() => onChange(tags.filter((x) => x !== t))}
            >
              <X size={10} />
            </button>
          </span>
        );
      })}
      <input
        className="pa-tag-input"
        list={listId}
        placeholder={tags.length ? "" : "Add element…"}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            add(value);
          } else if (e.key === "Backspace" && !value && tags.length) {
            onChange(tags.slice(0, -1));
          }
        }}
        onBlur={() => value && add(value)}
      />
      <datalist id={listId}>
        {suggestions.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
    </div>
  );
}
