import Link from "next/link";
import { RotateCcw, ArrowRight } from "lucide-react";
import { Shell } from "@/components/Shell";
import { PageHead, Pill } from "@/components/ui";
import { getInventory } from "@/lib/engines/masking";
import { FAMILIES, ruleLabel, runMaskCore, type Family, type Rule } from "@/lib/masking";

export const dynamic = "force-dynamic";

/** A representative rule + sample per family, for the library example preview. */
const EXAMPLE: Record<Family, { rule: Rule; sample: string }> = {
  partial: { rule: { family: "partial", params: { revealLast: 4, maskChar: "*" } }, sample: "9876543210" },
  full: { rule: { family: "full", params: {} }, sample: "9876543210" },
  fpe: { rule: { family: "fpe", params: { preserve: "digits" } }, sample: "4002119988" },
  hash: { rule: { family: "hash", params: { algorithm: "SHA-256" } }, sample: "W-771203" },
  tokenize: { rule: { family: "tokenize", params: { vault: "default" } }, sample: "4002119988" },
  generalize: { rule: { family: "generalize", params: { bucket: "age5" } }, sample: "1991-04-12" },
  synthetic: { rule: { family: "synthetic", params: { generator: "name" } }, sample: "Ravi Kumar" },
};

/**
 * SCREEN 2 — Rule library. The masking functions available to this tenant,
 * grouped by family. Read-only for this release.
 */
export default async function RuleLibraryPage() {
  const rows = await getInventory();
  const usage = (family: string) =>
    rows.filter((r) => r.effective?.family === family || r.channels.some((c) => c.family === family)).length;

  return (
    <Shell active="/masking/rules" title="Rule library">
      <PageHead title="Rule library" subtitle="Masking functions available to this tenant, grouped by family." />

      <div className="card-grid">
        {FAMILIES.map((f) => {
          const ex = EXAMPLE[f.key];
          const n = usage(f.key);
          return (
            <div key={f.key} className="role-card" style={{ cursor: "default" }}>
              <div className="row" style={{ justifyContent: "space-between", gap: 6 }}>
                <span className="cell-primary">{f.label}</span>
                <Pill tone={f.reversible ? "blue" : "gray"} dot={false}>{f.reversible ? "reversible" : "irreversible"}</Pill>
              </div>
              <p className="cell-sub role-card-desc">{f.description}</p>
              <div className="mask-preview sm" style={{ marginTop: 4 }}>
                <code className="mask-before">{ex.sample}</code>
                <ArrowRight size={13} className="muted" />
                <code className="mask-after">{runMaskCore(ex.rule, ex.sample)}</code>
              </div>
              <div className="stack" style={{ gap: 4, marginTop: "auto" }}>
                <span className="cell-sub">Example: {ruleLabel(ex.rule)}{f.onlyChannel ? " · Non-prod only" : ""}</span>
                {n > 0 ? (
                  <Link href={`/masking?family=${f.key}`} className="row-link">Used by {n} field{n === 1 ? "" : "s"} →</Link>
                ) : (
                  <span className="cell-sub">Not used yet</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <p className="cell-sub row" style={{ gap: 6, marginTop: 16 }}><RotateCcw size={13} /> Read-only for this release — families are defined by the platform.</p>
    </Shell>
  );
}
