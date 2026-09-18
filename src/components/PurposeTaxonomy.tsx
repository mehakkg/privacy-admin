"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Pill } from "@/components/ui";
import { ActionError } from "@/components/actions";
import { SelfApprovedTag } from "@/components/access/selfApprovedTag";
import {
  createPurposeAction,
  requestPurposeAction,
  setPurposeStatusAction,
} from "@/app/actions/governance";
import type { ActionResult } from "@/app/actions/requests";

export interface PurposeRow {
  id: string;
  name: string;
  description: string;
  status: string;
  approvedBy: string;
  approvedAt: string;
  selfApproved?: boolean;
}

const STATUS_TONE: Record<string, "green" | "yellow" | "gray"> = {
  approved: "green",
  draft: "yellow",
  retired: "gray",
};

/**
 * The purpose taxonomy, with edit affordances that depend on the acting role.
 *
 * As DPO: the inline-add table pattern from Processing Activities — add a blank
 * row, fill it, save. This is the DPO editing their own object.
 *
 * As Admin: read-only, with "Request new purpose", which raises an escalation
 * rather than creating anything. Admin never gets a direct create path to a
 * governance object.
 */
export function PurposeTaxonomy({
  purposes,
  canEdit,
}: {
  purposes: PurposeRow[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);

  // DPO: a single unsaved draft row.
  const [draft, setDraft] = useState<{ name: string; description: string; status: string } | null>(
    null,
  );

  // Admin: the request-purpose form.
  const [requesting, setRequesting] = useState(false);
  const [reqName, setReqName] = useState("");
  const [reqReason, setReqReason] = useState("");

  const run = (op: () => Promise<ActionResult>, after?: () => void) => {
    start(async () => {
      const r = await op();
      setResult(r);
      if (r.ok) {
        after?.();
        router.refresh();
      }
    });
  };

  return (
    <div>
      <div className="table-wrap">
        <table className="dtable">
          <thead>
            <tr>
              <th style={{ width: "26%" }}>Name</th>
              <th>Description</th>
              <th style={{ width: 130 }}>Status</th>
              {canEdit && <th style={{ width: 40 }} />}
            </tr>
          </thead>
          <tbody>
            {draft && (
              <tr className="pa-unsaved">
                <td>
                  <input
                    className="pa-input"
                    placeholder="Purpose name"
                    value={draft.name}
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  />
                </td>
                <td>
                  <input
                    className="pa-input"
                    placeholder="What this purpose covers"
                    value={draft.description}
                    onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                  />
                </td>
                <td>
                  <select
                    className="pa-input"
                    value={draft.status}
                    onChange={(e) => setDraft({ ...draft, status: e.target.value })}
                  >
                    <option value="approved">Approved</option>
                    <option value="draft">Draft</option>
                    <option value="retired">Retired</option>
                  </select>
                </td>
                <td>
                  <button className="icon-btn" aria-label="Discard row" onClick={() => setDraft(null)}>
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            )}

            {purposes.map((p) => (
              <tr key={p.id}>
                <td className="cell-primary"><span className="row" style={{ gap: 6, flexWrap: "wrap" }}>{p.name}{p.selfApproved && <SelfApprovedTag compact />}</span></td>
                <td className="muted">{p.description}</td>
                <td>
                  {canEdit ? (
                    <select
                      className="pa-input"
                      value={p.status}
                      disabled={pending}
                      onChange={(e) => run(() => setPurposeStatusAction(p.id, e.target.value))}
                    >
                      <option value="approved">Approved</option>
                      <option value="draft">Draft</option>
                      <option value="retired">Retired</option>
                    </select>
                  ) : (
                    <Pill tone={STATUS_TONE[p.status] ?? "gray"}>{p.status}</Pill>
                  )}
                </td>
                {canEdit && <td />}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="row" style={{ marginTop: 12, justifyContent: "space-between" }}>
        <span className="cell-sub">{purposes.length} purposes</span>

        {canEdit ? (
          draft ? (
            <div className="row" style={{ gap: 8 }}>
              <button className="btn ghost" onClick={() => setDraft(null)} disabled={pending}>
                Discard
              </button>
              <button
                className="btn primary"
                disabled={pending || !draft.name.trim()}
                onClick={() =>
                  run(
                    () => createPurposeAction(draft.name, draft.description, draft.status),
                    () => setDraft(null),
                  )
                }
              >
                {pending ? "Saving…" : "Save purpose"}
              </button>
            </div>
          ) : (
            <button
              className="btn primary sm"
              onClick={() => setDraft({ name: "", description: "", status: "approved" })}
            >
              + Add purpose
            </button>
          )
        ) : (
          <button className="btn sm" onClick={() => setRequesting((r) => !r)}>
            Request new purpose
          </button>
        )}
      </div>

      {!canEdit && requesting && (
        <div className="notice info" style={{ marginTop: 12 }}>
          <div className="notice-title">Request a new purpose from the DPO</div>
          <p className="cell-sub" style={{ margin: "0 0 8px" }}>
            Admin cannot add a purpose directly. This raises an escalation to
            whoever is acting as DPO; nothing is created until they approve it.
          </p>
          <input
            className="input"
            placeholder="Purpose name"
            value={reqName}
            onChange={(e) => setReqName(e.target.value)}
          />
          <textarea
            className="input"
            style={{ marginTop: 8 }}
            rows={2}
            placeholder="Why is this purpose needed?"
            value={reqReason}
            onChange={(e) => setReqReason(e.target.value)}
          />
          <div className="row" style={{ marginTop: 8 }}>
            <button
              className="btn primary sm"
              disabled={pending || !reqName.trim()}
              onClick={() =>
                run(
                  () => requestPurposeAction(reqName, reqReason),
                  () => {
                    setRequesting(false);
                    setReqName("");
                    setReqReason("");
                  },
                )
              }
            >
              Raise request
            </button>
          </div>
        </div>
      )}

      <ActionError result={result} />
    </div>
  );
}
