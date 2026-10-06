import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { getLive } from "@/lib/engines/maskingpolicy";
import { UndoButton } from "@/components/maskingpolicy/PolicyActions";

const MP = "/data-flow/masking-policy";

/** SCREEN 5 — Live. A full-page confirmation. Replaces the post-activation banner. */
export async function Live({ number }: { number: number }) {
  const live = await getLive(number);
  if (!live) return <div className="mp-card"><p>Version not found. <Link href={MP} className="row-link">Back to Masking policy</Link></p></div>;

  return (
    <div className="mp-live">
      <CheckCircle2 size={48} style={{ color: "var(--green)" }} />
      <h1 style={{ margin: 0 }}>Version {live.number} is live.</h1>
      {live.prev == null ? (
        <p className="cell-sub" style={{ margin: 0, maxWidth: 560 }}>Your applications now show masked values instead of fully hidden ones. Applications pick it up within seconds.</p>
      ) : (
        <p className="cell-sub" style={{ margin: 0, maxWidth: 520 }}>Applications pick it up within seconds. Version {live.prev} stays in your history.</p>
      )}
      {live.reason && <p style={{ margin: 0 }}>Reason: &ldquo;{live.reason}&rdquo;</p>}
      <div className="row" style={{ gap: 10, marginTop: 8, flexWrap: "wrap", justifyContent: "center" }}>
        <Link href={`${MP}?see=${encodeURIComponent(live.topAudience)}`} className="btn primary">See what {live.topAudience} sees</Link>
        {live.prev != null && <UndoButton number={live.prev} active={live.number} />}
      </div>
      <Link href={MP} className="row-link" style={{ marginTop: 6 }}>Back to Masking policy</Link>
    </div>
  );
}
