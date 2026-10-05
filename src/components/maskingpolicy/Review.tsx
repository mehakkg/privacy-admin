import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { getDraft, getChecks, getImpact } from "@/lib/engines/maskingpolicy";
import { ActivateForm } from "@/components/maskingpolicy/ActivateForm";
import type { ImpactItem } from "@/lib/maskingpolicy";

const BASE = "/data-flow/masking-policy";

function Group({ title, items, defaultOpen }: { title: string; items: ImpactItem[]; defaultOpen?: boolean }) {
  if (items.length === 0) return null;
  return (
    <details open={defaultOpen} className="mp-impact-group">
      <summary><strong>{title}</strong> <span className="cell-sub">{items.length}</span></summary>
      <div className="stack" style={{ gap: 6, marginTop: 8 }}>
        {items.map((it, i) => (
          <div key={i} className="mp-impact-row">
            <span>{it.audienceLabel}{it.channelLabel ? `, on ${it.channelLabel}` : ""}, sees {it.fieldName} as <span className="mono">{it.after}</span> <span className="cell-sub">(was <span className="mono">{it.before}</span>)</span>. <span className={`mp-dir ${it.direction.toLowerCase()}`}>{it.direction}</span>{it.fullRaw && <span className="mp-tag new">full raw</span>}</span>
            {it.reason && <div className="cell-sub">Reason: {it.reason}</div>}
          </div>
        ))}
      </div>
    </details>
  );
}

export async function Review() {
  const draft = await getDraft();
  if (!draft) return <div className="mp-card"><p>No draft to review. <Link href={BASE} className="row-link">Back to Masking Policy</Link></p></div>;
  const [checks, impact] = await Promise.all([getChecks(draft.id), getImpact(draft.id)]);
  const blocking = checks.filter((c) => c.level === "blocking" && !c.ok);
  const everyone = impact.items.filter((i) => i.audienceId === null);
  const looser = impact.items.filter((i) => i.audienceId && i.direction === "Looser");
  const tighter = impact.items.filter((i) => i.audienceId && i.direction === "Tighter");
  const neutral = impact.items.filter((i) => i.audienceId && i.direction === "Neutral");

  return (
    <div className="stack" style={{ gap: 16, maxWidth: 820 }}>
      <div><Link href={`${BASE}?view=workspace`} className="row-link">← Back to draft</Link></div>
      <h2 style={{ margin: 0 }}>Review and activate · version {draft.number}</h2>
      <p className="cell-sub" style={{ margin: 0 }}>{impact.counts.changes} changes · {impact.counts.looser} looser · {impact.counts.tighter} tighter · {impact.counts.neutral} neutral · {impact.counts.fullRaw} full raw grant{impact.counts.fullRaw === 1 ? "" : "s"}.</p>

      <section className="mp-card">
        <h4 className="mp-card-h">Impact</h4>
        <Group title="Looser" items={looser} defaultOpen />
        <Group title="Everyone" items={everyone} defaultOpen />
        <Group title="Tighter" items={tighter} />
        <Group title="Neutral" items={neutral} />
        {impact.items.length === 0 && <p className="cell-sub">No behavioural changes.</p>}
      </section>

      <section className="mp-card">
        <h4 className="mp-card-h">Fields that stay fully hidden</h4>
        <p className="cell-sub" style={{ margin: 0 }}>{impact.hiddenFields.length === 0 ? "None." : impact.hiddenFields.join(", ")}.</p>
      </section>

      {blocking.length > 0 && (
        <section className="mp-card" style={{ borderColor: "var(--red-border)" }}>
          <h4 className="mp-card-h" style={{ color: "var(--red)" }}>Resolve before activating</h4>
          <div className="stack" style={{ gap: 6 }}>
            {blocking.map((c, i) => (
              <Link key={i} href={`${BASE}?view=workspace&field=${c.anchor?.fieldCode ?? ""}`} className="row" style={{ gap: 8, color: "var(--red)" }}><AlertTriangle size={14} /> {c.message}</Link>
            ))}
          </div>
        </section>
      )}

      <section className="mp-card">
        <ActivateForm vid={draft.id} number={draft.number} blocked={blocking.length > 0} />
      </section>
    </div>
  );
}
