import Link from "next/link";
import { getAttentionSequence } from "@/lib/engines/maskingpolicy";

const MP = "/data-flow/masking-policy";

/** Slim bar on landings reached from Home's Needs attention. Back + Next, driven
 *  by the ?ai URL parameter so it survives a reload. Numbering is fixed on leaving
 *  Home; Next skips items that have since cleared. */
export async function ContextBar({ ai }: { ai: number }) {
  const seq = await getAttentionSequence();
  const total = seq.length;
  const position = (seq.findIndex((s) => s.ai === ai) + 1) || ai + 1;
  const next = seq.find((s) => s.ai > ai) ?? null;
  return (
    <div className="mp-ctxbar">
      <Link href={MP} className="row-link">← Back to Masking policy</Link>
      <span className="cell-sub">From Masking policy · Needs attention · {position} of {total}</span>
      {next ? <Link href={next.href} className="row-link">Next: {next.verb} →</Link> : <span />}
    </div>
  );
}
