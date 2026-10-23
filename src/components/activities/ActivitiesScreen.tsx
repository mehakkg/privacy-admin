"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Search, Download, ChevronDown, ChevronRight, MoreHorizontal } from "lucide-react";
import type { ActivitiesScreen as Screen, ScreenRow } from "@/lib/engines/activities";
import type { Check } from "@/lib/activities/readiness";
import { formatDate } from "@/lib/datamap/foundations";
import { createDraftActivityAction } from "@/app/actions/activities";

const BASE = "/data-map/processing-activities";

/**
 * Activities screen (redesign): a coverage strip + two tabs — "My work" (actions
 * grouped by who must act) and "Register" (the full record list). Every number is
 * computed from the fixture store.
 */
export function ActivitiesScreen({ screen, role, tab }: { screen: Screen; role: string; tab: string }) {
  const router = useRouter();
  const [, start] = useTransition();
  const myActor = role === "dpo" ? "dpo" : role === "ciso" || role === "legal" ? "none" : "admin";
  const [q, setQ] = useState("");
  const addActivity = () => start(async () => { const r = await createDraftActivityAction("New activity"); if (r.ok && r.id) router.push(`${BASE}/${r.id}/edit?pane=basics`); });
  const active = tab === "register" || tab === "work" ? tab : (myActor === "admin" ? "work" : "register");

  useEffect(() => { try { localStorage.setItem("activities.tab", active); } catch { /* fine */ } }, [active]);
  const setTab = (t: string) => router.push(`${BASE}?tab=${t}`);

  const myWorkCount = screen.rows.filter((r) => r.actor !== "none" && r.actor === myActor).length;
  const filtered = screen.rows.filter((r) => !q || `${r.name} ${r.owner ?? ""} ${r.principals.join(" ")}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="pa-list">
      <div className="pa-head">
        <div className="stack" style={{ gap: 4 }}>
          <div className="cell-sub">Configure / Data Map / Activities</div>
          <h1 className="inv-title">Activities</h1>
          <p className="cell-sub" style={{ margin: 0, maxWidth: 680 }}>Your register of how personal data is processed. Notices, rights requests and DPIAs are built from it.</p>
        </div>
        <div className="row" style={{ gap: 8, whiteSpace: "nowrap" }}>
          <a href="/api/discovery/export" className="btn sec inv-nowrap" style={{ whiteSpace: "nowrap" }}><Download size={13} /> Export register</a>
          <button className="btn primary" onClick={addActivity}>+ Add activity</button>
        </div>
      </div>

      <CoverageStrip c={screen.coverage} />

      <div className="dm-tabs" style={{ marginTop: 14 }}>
        <button className={`dm-tab${active === "work" ? " on" : ""}`} onClick={() => setTab("work")}>My work {myWorkCount}</button>
        <button className={`dm-tab${active === "register" ? " on" : ""}`} onClick={() => setTab("register")}>Register {screen.rows.length}</button>
      </div>

      <div className="inv-search" style={{ maxWidth: 320, marginTop: 14 }}>
        <Search size={14} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search activity, owner or field" aria-label="Search" />
      </div>

      {active === "work" ? <MyWork rows={filtered} myActor={myActor} /> : <Register rows={filtered} />}
    </div>
  );
}

function CoverageStrip({ c }: { c: Screen["coverage"] }) {
  if (!c.dlpConnected) return <div className="inv-card" style={{ marginTop: 12 }}><div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}><span>Connect DLP to measure how much of your personal data is in the register.</span><Link href="/integrations/dlp" className="btn primary sm">Connect DLP</Link></div></div>;
  const tone = c.pct < 50 ? "var(--yellow-700, #b45309)" : c.pct >= 90 ? "var(--green, #16a34a)" : "var(--accent, #2563eb)";
  return (
    <div className="inv-card" style={{ marginTop: 12 }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
        <div className="stack" style={{ gap: 6 }}>
          <div className="row" style={{ gap: 12, alignItems: "center" }}>
            <span className="cell-sub">Register coverage</span>
            <span style={{ fontSize: 28, fontWeight: 600 }}>{c.pct}%</span>
            <span style={{ display: "inline-block", width: 240, height: 8, borderRadius: 999, background: "var(--border-soft, #e5e7eb)", overflow: "hidden" }}><span style={{ display: "block", height: "100%", width: `${c.pct}%`, background: tone }} /></span>
            <span className="cell-sub tnum">{c.registerFields} of {c.totalFields} personal-data fields</span>
          </div>
          <div className="cell-sub">{c.inProgressFields} are in activities still in progress · {c.orphanFields} aren’t in any activity → <Link href="/discovery/ropa" className="link-btn">Review {c.suggestions} suggestions</Link>{c.dlpStale ? <> · Based on DLP sync of {c.lastSyncLabel} · <Link href="/integrations/dlp" className="link-btn">Sync now</Link></> : ""}</div>
        </div>
        <div className="cell-sub" style={{ whiteSpace: "nowrap" }}>In the register <strong className="tnum">{c.inRegisterCount}</strong> · In progress <strong className="tnum">{c.inProgressCount}</strong> · Last exported {c.lastExported ?? "never"}</div>
      </div>
    </div>
  );
}

// --- Progress dots ----------------------------------------------------------
function Dots({ checks }: { checks: Check[] }) {
  const passed = checks.filter((c) => c.state === "pass").length;
  const blocked = checks.find((c) => c.state === "block");
  const title = checks.map((c) => `${c.label} ${c.state === "pass" ? "✓" : c.state === "block" ? "✗" : c.state === "na" ? "–" : "·"}`).join(" · ");
  const color = (s: Check["state"]) => s === "pass" ? "var(--green, #16a34a)" : s === "block" ? "transparent" : "transparent";
  return (
    <span className="row" style={{ gap: 4, alignItems: "center" }} role="img" aria-label={`Readiness: ${passed} of 6 checks passed.${blocked ? ` Blocked at ${blocked.label}.` : ""}`} title={title}>
      {checks.map((c, i) => (
        c.state === "na"
          ? <span key={i} style={{ width: 8, height: 2, background: "var(--border, #cbd5e1)" }} />
          : <span key={i} style={{ width: 8, height: 8, borderRadius: "50%", background: color(c.state), border: c.state === "block" ? "2px solid var(--yellow-700, #b45309)" : c.state === "todo" ? "1px solid var(--border, #cbd5e1)" : "none" }} />
      ))}
    </span>
  );
}

// --- My work ----------------------------------------------------------------
function MyWork({ rows, myActor }: { rows: ScreenRow[]; myActor: string }) {
  const you = rows.filter((r) => r.actor === myActor);
  const otherAdmin = rows.filter((r) => r.actor === "admin" && myActor !== "admin");
  const otherDpo = rows.filter((r) => r.actor === "dpo" && myActor !== "dpo");
  const owners = rows.filter((r) => r.actor === "owner");
  const groups: { label: string; rows: ScreenRow[]; kind: "you" | "dpo" | "admin" | "owner" }[] = [
    { label: "You", rows: you, kind: myActor === "dpo" ? "dpo" : "you" },
    ...(myActor === "admin" ? [{ label: "Waiting on Kavita Menon", rows: otherDpo, kind: "dpo" as const }] : [{ label: "Waiting on Ritu Nair", rows: otherAdmin, kind: "admin" as const }]),
    { label: "Waiting on business owners", rows: owners, kind: "owner" as const },
  ];
  return (
    <div className="stack" style={{ gap: 18, marginTop: 14 }}>
      {groups.map((g) => <WorkGroup key={g.label} label={g.label} rows={g.rows} canAct={g.kind === "you"} youGroup={g.label === "You"} />)}
    </div>
  );
}

function WorkGroup({ label, rows, canAct, youGroup }: { label: string; rows: ScreenRow[]; canAct: boolean; youGroup: boolean }) {
  const [open, setOpen] = useState(true);
  const oldest = rows.reduce((m, r) => Math.max(m, r.overdueDays ?? r.waitingDays), 0);
  if (rows.length === 0 && youGroup) return <div><div className="cell-sub" style={{ fontWeight: 600, marginBottom: 6 }}>{label} · 0</div><div className="inv-noresult">You’re clear. Nothing needs you right now. <Link href={`${BASE}?tab=register`} className="link-btn">View register →</Link></div></div>;
  if (rows.length === 0) return null;
  return (
    <div>
      <button className="row" style={{ gap: 8, alignItems: "center", background: "none", border: 0, cursor: "pointer", padding: 0, fontWeight: 600 }} onClick={() => setOpen((o) => !o)}>
        {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}{label} · {rows.length}{oldest > 0 ? <span className="cell-sub" style={{ fontWeight: 400 }}>: oldest waiting {oldest}d</span> : ""}
      </button>
      {open && <div className="stack" style={{ gap: 0, marginTop: 6 }}>{rows.slice().sort((a, b) => (b.overdueDays ?? b.waitingDays) - (a.overdueDays ?? a.waitingDays)).map((r) => <WorkRow key={r.id} r={r} canAct={canAct} />)}</div>}
    </div>
  );
}

function WorkRow({ r, canAct }: { r: ScreenRow; canAct: boolean }) {
  const router = useRouter();
  const [, start] = useTransition();
  const [reminded, setReminded] = useState(false);
  const waitLabel = r.overdueDays != null ? `Overdue ${r.overdueDays}d` : `Waiting ${r.waitingDays}d`;
  const btn = canAct
    ? <button className="btn sm primary" onClick={() => router.push(`${BASE}/${r.id}?tab=fields`)}>{shortVerb(r)}</button>
    : reminded ? <button className="btn sm" disabled>Reminded just now</button>
    : <button className="btn sm ghost" onClick={() => start(() => { setReminded(true); })}>{r.actor === "owner" ? "Remind owner" : "Remind"}</button>;
  return (
    <div className="row" style={{ justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderTop: "1px solid var(--border-soft)", gap: 12 }}>
      <div className="stack" style={{ gap: 2, minWidth: 0 }} role="button" onClick={() => router.push(`${BASE}/${r.id}`)}>
        <div className="av-name" style={{ cursor: "pointer" }}>{r.name}</div>
        <div className="cell-sub">{r.owner ?? "No owner"}{r.department ? ` · ${r.department}` : ""}</div>
      </div>
      <div className="row" style={{ gap: 10, alignItems: "center" }}><Dots checks={r.checks} /><span className={`rchip ${r.chipTone}`}>{r.chipLabel}</span></div>
      <div className="row" style={{ gap: 12, alignItems: "center", whiteSpace: "nowrap" }}><span className={`cell-sub${(r.overdueDays ?? r.waitingDays) > 14 ? " sev-warning" : ""}`}>{waitLabel}</span>{btn}</div>
    </div>
  );
}

function shortVerb(r: ScreenRow): string {
  switch (r.state) {
    case "needs_basics": return r.owner ? "Add principal" : "Add owner";
    case "needs_data": return "Add fields";
    case "needs_processors": return "Choose systems";
    case "needs_approval": return r.next?.text.startsWith("Resubmit") ? "Resubmit purpose" : "Submit purpose";
    case "needs_notice": return "Add to notice";
    case "ready_to_submit": return "Submit for DPO review";
    default: return "Open";
  }
}

// --- Register ---------------------------------------------------------------
const URGENCY: Record<string, number> = { review_due: 0, needs_basics: 1, needs_data: 1, needs_processors: 1, needs_approval: 1, needs_notice: 1, ready_to_submit: 1, waiting_for_dpo: 2, approved: 3 };
function Register({ rows }: { rows: ScreenRow[] }) {
  const router = useRouter();
  const [chip, setChip] = useState<"all" | "register" | "progress">("all");
  const multiFiduciary = new Set(rows.map((r) => r.entityId)).size > 1;
  const shown = rows.filter((r) => chip === "all" ? true : chip === "register" ? r.inRegister : !r.inRegister);
  const sorted = useMemo(() => shown.slice().sort((a, b) => {
    const u = URGENCY[a.state] - URGENCY[b.state]; if (u) return u;
    if (a.state === "review_due") return (b.overdueDays ?? 0) - (a.overdueDays ?? 0);
    if (a.inRegister) return (b.reviewedAt ?? "").localeCompare(a.reviewedAt ?? "");
    return b.waitingDays - a.waitingDays;
  }), [shown]);
  const counts = { all: rows.length, register: rows.filter((r) => r.inRegister).length, progress: rows.filter((r) => !r.inRegister).length };
  return (
    <div className="stack" style={{ gap: 12, marginTop: 14 }}>
      <div className="mp-segment" style={{ alignSelf: "flex-start" }}>
        <button className={chip === "all" ? "on" : ""} onClick={() => setChip("all")}>All <span className="tnum">{counts.all}</span></button>
        <button className={chip === "register" ? "on" : ""} onClick={() => setChip("register")}>In the register <span className="tnum">{counts.register}</span></button>
        <button className={chip === "progress" ? "on" : ""} onClick={() => setChip("progress")}>In progress <span className="tnum">{counts.progress}</span></button>
      </div>
      <table className="av-table">
        <thead><tr><th></th><th>Activity</th><th>Owner</th><th>Data principals</th><th>Contents</th><th>Status</th><th>Age</th><th></th></tr></thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={r.id} className="av-row" onClick={(e) => { if ((e.target as HTMLElement).closest("button,a,input")) return; router.push(`${BASE}/${r.id}`); }}>
              <td className="inv-check"><input type="checkbox" aria-label={`Select ${r.name}`} /></td>
              <td><span className="av-name">{r.name}</span>{multiFiduciary && r.entityShort !== "—" && <span className="chip" style={{ marginLeft: 6, fontSize: 10.5 }} title={r.entityName ?? ""}>{r.entityShort}</span>}</td>
              <td>{r.owner ?? <span className="sev-warning">No owner</span>}<div className="cell-sub">{r.department ?? "—"}</div></td>
              <td className="cell-sub">{r.principals.slice(0, 2).join(", ")}{r.principals.length > 2 ? ` +${r.principals.length - 2}` : ""}</td>
              <td className="cell-sub">{r.purposeCount} purpose{r.purposeCount === 1 ? "" : "s"} · {r.fieldCount} field{r.fieldCount === 1 ? "" : "s"} · {r.systemCount} system{r.systemCount === 1 ? "" : "s"}</td>
              <td><div className="stack" style={{ gap: 3 }}><span className={`rchip ${r.chipTone}`}>{r.chipLabel}</span>{r.statusActor && <span className="row" style={{ gap: 6, alignItems: "center" }}><Dots checks={r.checks} /><span className="cell-sub">{r.statusActor}</span></span>}</div></td>
              <td className="cell-sub">{r.inRegister && r.state === "approved" ? `Reviewed ${r.reviewedAt ? formatDate(r.reviewedAt) : "—"}` : r.overdueDays != null ? <span className="sev-warning">Overdue {r.overdueDays}d</span> : <span className={r.waitingDays > 14 ? "sev-warning" : ""}>Waiting {r.waitingDays}d</span>}</td>
              <td><button className="icon-btn" aria-label="Actions" onClick={() => router.push(`${BASE}/${r.id}`)}><MoreHorizontal size={16} /></button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
