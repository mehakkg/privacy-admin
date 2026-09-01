"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ListDetail, type Column } from "@/components/ListDetail";
import { Pill } from "@/components/ui";
import { ActionError } from "@/components/actions";
import { mapScriptAction, resolveFindingAction } from "@/app/actions/consent";
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

/** Category + default state read-only; the script→category mapping is editable. */
export function ScriptMapper({
  categories,
  scripts,
}: {
  categories: { id: string; name: string; defaultState: string }[];
  scripts: { id: string; name: string; vendor: string | null; page: string | null; categoryId: string | null }[];
}) {
  const { pending, result, run } = useAction();

  return (
    <div>
      <div className="table-wrap">
        <table className="dtable">
          <thead>
            <tr>
              <th>Script</th>
              <th>Vendor</th>
              <th>Page</th>
              <th>Category</th>
              <th style={{ width: 90 }}>Default</th>
            </tr>
          </thead>
          <tbody>
            {scripts.map((s) => {
              const cat = categories.find((c) => c.id === s.categoryId);
              return (
                <tr key={s.id}>
                  <td className="cell-primary">{s.name}</td>
                  <td className="cell-sub">{s.vendor ?? "—"}</td>
                  <td className="cell-sub mono">{s.page ?? "—"}</td>
                  <td>
                    <select
                      className="pa-input"
                      value={s.categoryId ?? ""}
                      disabled={pending}
                      onChange={(e) => run(() => mapScriptAction(s.id, e.target.value || null))}
                    >
                      <option value="">— unmapped —</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    {/* Policy-locked: reflects the DPO's category default. */}
                    <Pill tone={cat?.defaultState === "on" ? "blue" : "gray"}>
                      {cat ? cat.defaultState : "—"}
                    </Pill>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <ActionError result={result} />
    </div>
  );
}

interface FindingRow {
  id: string;
  scriptName: string;
  vendor: string | null;
  page: string;
  disclosed: boolean;
  status: string;
  suggestedCategory: string | null;
}

/** Compliance scan results, reusing the List + Detail drawer. */
export function CookieFindings({
  categories,
  findings,
}: {
  categories: { id: string; name: string }[];
  findings: FindingRow[];
}) {
  const { pending, result, run } = useAction();

  const columns: Column<FindingRow>[] = [
    {
      key: "script",
      header: "Script",
      render: (f) => (
        <div className="cell-stack">
          <span className="cell-primary">{f.scriptName}</span>
          <span className="cell-sub mono">{f.page}</span>
        </div>
      ),
    },
    {
      key: "disclosed",
      header: "Disclosed",
      width: 120,
      render: (f) =>
        f.disclosed ? <Pill tone="green">Disclosed</Pill> : <Pill tone="red">Undisclosed</Pill>,
    },
    {
      key: "status",
      header: "Status",
      width: 110,
      render: (f) =>
        f.status === "open" ? (
          <Pill tone="yellow">Open</Pill>
        ) : (
          <Pill tone="gray">{f.status}</Pill>
        ),
    },
  ];

  return (
    <div>
      <ListDetail<FindingRow>
        items={findings}
        columns={columns}
        emptyLabel="No scripts flagged."
        detailEmptyLabel="Select a script to decide on it."
        renderDetail={(f, { advance }) => (
          <FindingPanel
            key={f.id}
            finding={f}
            categories={categories}
            pending={pending}
            onResolve={(res, catId) => run(() => resolveFindingAction(f.id, res, catId), advance)}
          />
        )}
      />
      <ActionError result={result} />
    </div>
  );
}

function FindingPanel({
  finding,
  categories,
  pending,
  onResolve,
}: {
  finding: FindingRow;
  categories: { id: string; name: string }[];
  pending: boolean;
  onResolve: (resolution: "categorised" | "blocked" | "dismissed", categoryId: string | null) => void;
}) {
  const suggested = categories.find(
    (c) => c.name.toLowerCase() === (finding.suggestedCategory ?? "").toLowerCase(),
  );
  const [categoryId, setCategoryId] = useState(suggested?.id ?? "");

  return (
    <div className="stack" style={{ gap: 14 }}>
      <div>
        <div className="cell-primary" style={{ fontSize: 14, fontWeight: 600 }}>
          {finding.scriptName}
        </div>
        <div className="cell-sub">
          {finding.vendor ?? "Unknown vendor"} · {finding.page}
        </div>
      </div>

      {!finding.disclosed && (
        <div className="notice danger compact">
          <span>
            This script fired without being disclosed in the cookie policy. It
            needs a category, or it should be blocked.
          </span>
        </div>
      )}

      <div>
        <div className="section-label">Assign a category</div>
        <select className="input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          <option value="">— choose —</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {finding.status === "open" ? (
        <div className="row" style={{ gap: 8 }}>
          <button
            className="btn primary"
            disabled={pending || !categoryId}
            onClick={() => onResolve("categorised", categoryId)}
          >
            Categorise
          </button>
          <button className="btn danger" disabled={pending} onClick={() => onResolve("blocked", null)}>
            Block until categorised
          </button>
          <button className="btn ghost" disabled={pending} onClick={() => onResolve("dismissed", null)}>
            Dismiss
          </button>
        </div>
      ) : (
        <div className="notice ok compact">
          <span>Resolved — {finding.status}.</span>
        </div>
      )}
    </div>
  );
}

export function BannerConfig() {
  const [brandColor, setBrandColor] = useState("#2563eb");
  const [layout, setLayout] = useState<"bar" | "box">("bar");
  const [heading, setHeading] = useState("We value your privacy");

  return (
    <div className="grid-2">
      <div>
        <div className="section-label">Heading</div>
        <input className="input" value={heading} onChange={(e) => setHeading(e.target.value)} />

        <div className="section-label" style={{ marginTop: 12 }}>
          Accent colour
        </div>
        <input className="input" value={brandColor} onChange={(e) => setBrandColor(e.target.value)} />

        <div className="section-label" style={{ marginTop: 12 }}>
          Layout
        </div>
        <div className="row" style={{ gap: 6 }}>
          <button className={`btn sm ${layout === "bar" ? "primary" : "ghost"}`} onClick={() => setLayout("bar")}>
            Bottom bar
          </button>
          <button className={`btn sm ${layout === "box" ? "primary" : "ghost"}`} onClick={() => setLayout("box")}>
            Corner box
          </button>
        </div>
      </div>

      <div>
        <div className="section-label">Live preview</div>
        <div
          style={{
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-md)",
            background: "var(--bg-page)",
            padding: 16,
            minHeight: 140,
            position: "relative",
          }}
        >
          <div
            style={{
              position: "absolute",
              ...(layout === "bar"
                ? { left: 12, right: 12, bottom: 12 }
                : { right: 12, bottom: 12, width: 200 }),
              background: "var(--bg)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius)",
              padding: 12,
              boxShadow: "var(--shadow-popover)",
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>{heading}</div>
            <div style={{ fontSize: 11.5, color: "var(--text-3)", marginBottom: 8 }}>
              We use cookies to improve your experience.
            </div>
            <div className="row" style={{ gap: 6 }}>
              <span style={{ background: brandColor, color: "#fff", fontSize: 11, padding: "3px 10px", borderRadius: 4 }}>
                Accept
              </span>
              <span style={{ border: "1px solid var(--border)", fontSize: 11, padding: "3px 10px", borderRadius: 4 }}>
                Reject
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
