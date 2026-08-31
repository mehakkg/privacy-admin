import type { ReactNode } from "react";
import Link from "next/link";
import type { CompletionState, ExecutionStatus } from "@/lib/domain";
import {
  COMPLETION_STATE_LABEL,
  EXECUTION_STATUS_LABEL,
} from "@/lib/domain";

export type PillTone =
  | "green"
  | "red"
  | "yellow"
  | "blue"
  | "purple"
  | "gray"
  | "orange";

export function Pill({
  tone = "gray",
  children,
  dot = true,
}: {
  tone?: PillTone;
  children: ReactNode;
  dot?: boolean;
}) {
  return (
    <span className={`pill ${tone}`}>
      {dot && <span className="dot" />}
      {children}
    </span>
  );
}

/**
 * The single rendering of completion state in the product.
 *
 * Three states, never two. "Partially complete" is a first-class outcome with
 * its own colour, not a nearly-done variant of success — that visual equivalence
 * is how a partial result comes to be read as a finished one.
 */
const COMPLETION_TONE: Record<CompletionState, PillTone> = {
  pending: "gray",
  partial: "yellow",
  verified: "green",
};

export function CompletionPill({
  state,
  hasFailures = false,
}: {
  state: CompletionState;
  hasFailures?: boolean;
}) {
  return (
    <span className="row" style={{ gap: 6 }}>
      <Pill tone={COMPLETION_TONE[state]}>{COMPLETION_STATE_LABEL[state]}</Pill>
      {hasFailures && <Pill tone="red">Failure</Pill>}
    </span>
  );
}

const EXECUTION_TONE: Record<ExecutionStatus, PillTone> = {
  pending: "gray",
  partial: "yellow",
  verified: "green",
  failed: "red",
};

export function ExecutionPill({ status }: { status: ExecutionStatus }) {
  return <Pill tone={EXECUTION_TONE[status]}>{EXECUTION_STATUS_LABEL[status]}</Pill>;
}

export function Notice({
  tone = "info",
  title,
  children,
}: {
  tone?: "info" | "warn" | "danger" | "ok" | "policy";
  title?: string;
  children: ReactNode;
}) {
  return (
    <div className={`notice ${tone}`}>
      {title && <div className="notice-title">{title}</div>}
      <div>{children}</div>
    </div>
  );
}

/**
 * Renders the "this is approved policy, you are implementing it" treatment
 * required by criterion 6. Used wherever Admin sees a governance-owned object,
 * so the distinction between approved policy and editable configuration is
 * visible rather than implied.
 */
export function GovernanceBanner({
  owner,
  object,
}: {
  owner: string;
  object: string;
}) {
  return (
    <Notice tone="policy" title={`Approved policy — implementing`}>
      {object} is created and approved by the {owner}. Admin implements it and
      cannot change it here. Changes must be requested from the {owner}.
    </Notice>
  );
}

/**
 * POLICY-LOCK — the field-level counterpart to GovernanceBanner.
 *
 * Used wherever a DPO- or CISO-owned value is DISPLAYED rather than edited. It
 * exists because the failure mode is not "Admin edits a locked field and the
 * save fails" — it is Admin reading a governance value, assuming it is theirs
 * to change, and building a plan around changing it. The lock and the owner
 * name are there to prevent that assumption, so both are always shown.
 *
 * Renders as a bordered read-only region, deliberately NOT styled like an input.
 */
export function PolicyLocked({
  owner,
  where = "Governance Portal",
  children,
  compact = false,
}: {
  /** Who owns this value — "DPO", "CISO". */
  owner: string;
  /** Where it is maintained, for the microcopy. */
  where?: string;
  children: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={`policy-locked${compact ? " compact" : ""}`}>
      <div className="policy-locked-body">{children}</div>
      <div className="policy-locked-foot">
        <span className="policy-lock-icon" aria-hidden>
          🔒
        </span>
        <span>
          Set by {owner} · Managed in {where}
        </span>
      </div>
    </div>
  );
}

/** Inline lock marker for a single value inside a denser layout. */
export function LockMark({ owner }: { owner: string }) {
  return (
    <span className="lock-mark" title={`Set by ${owner} — managed in the Governance Portal`}>
      <span aria-hidden>🔒</span>
      <span>Set by {owner}</span>
    </span>
  );
}

export function Card({
  title,
  actions,
  children,
  footer,
}: {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <section className="card">
      {(title || actions) && (
        <div className="card-head">
          {title && <h2 className="card-title">{title}</h2>}
          {actions && <div style={{ marginLeft: "auto" }} className="row">{actions}</div>}
        </div>
      )}
      <div className="card-body">{children}</div>
      {footer && <div className="card-foot">{footer}</div>}
    </section>
  );
}

export function PageHead({
  crumbs,
  title,
  titleTip,
  subtitle,
  actions,
}: {
  crumbs?: { label: string; href?: string }[];
  title: string;
  /**
   * Framing copy — what this page is for, whose decision it implements — as a
   * tooltip beside the title rather than a standing sentence. It is read once
   * and then re-read never, but a permanent subtitle pushes the table down on
   * every single load.
   *
   * `subtitle` is still available for pages where the line genuinely changes
   * with the data (a status summary, a live count).
   */
  titleTip?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="page-head">
      <div>
        {crumbs && crumbs.length > 0 && (
          <div className="crumbs">
            {crumbs.map((c, i) => (
              <span key={`${c.label}-${i}`}>
                {i > 0 && <span className="sep">/</span>}
                {c.href ? <Link href={c.href}>{c.label}</Link> : c.label}
              </span>
            ))}
          </div>
        )}
        <h1 className="page-title">
          {title}
          {titleTip && (
            <span style={{ marginLeft: 8 }}>
              <InfoTip text={titleTip} align="left" />
            </span>
          )}
        </h1>
        {subtitle && <p className="page-subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="page-head-actions">{actions}</div>}
    </div>
  );
}

export function KeyValue({ rows }: { rows: [ReactNode, ReactNode][] }) {
  return (
    <dl className="kv">
      {rows.map(([k, v], i) => (
        <div key={i} style={{ display: "contents" }}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function FieldChips({ fields }: { fields: string[] }) {
  if (fields.length === 0) return <span className="muted">None</span>;
  return (
    <div>
      {fields.map((f) => (
        <code key={f} className="field-chip">
          {f}
        </code>
      ))}
    </div>
  );
}

/**
 * A citation rendered next to anything derived from law or policy, so a
 * reviewer can check the rule rather than trust the number — and so an
 * organisational target is never mistaken for a statutory obligation.
 */
export function Citation({
  citation,
  source,
}: {
  citation: string;
  source: "statute" | "org_policy";
}) {
  return (
    <span className="cell-sub" style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
      <Pill tone={source === "statute" ? "blue" : "gray"} dot={false}>
        {source === "statute" ? "Statutory" : "Org policy"}
      </Pill>
      {citation}
    </span>
  );
}

export function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: ReactNode;
  tone?: "red" | "green" | "yellow";
}) {
  const color =
    tone === "red"
      ? "var(--red)"
      : tone === "green"
        ? "var(--green)"
        : tone === "yellow"
          ? "var(--yellow)"
          : undefined;
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value" style={color ? { color } : undefined}>
        {value}
      </div>
    </div>
  );
}

export function formatDate(d: Date | null | undefined): string {
  if (!d) return "—";
  return d.toISOString().slice(0, 10);
}

export function formatDateTime(d: Date | null | undefined): string {
  if (!d) return "—";
  return `${d.toISOString().slice(0, 10)} ${d.toISOString().slice(11, 16)} UTC`;
}

/**
 * Hover-gated explanation.
 *
 * The density rule: anything that explains why a field matters, what a status
 * means, or what happens if something is skipped goes behind this rather than
 * standing permanently inline. A sentence read once but rendered on every load
 * costs every subsequent scan.
 *
 * CSS-only, so it works in server components with no client boundary. Not used
 * for error states — "what failed / why / what to do next" is functional
 * guidance Admin acts on, and hiding it behind a hover would be a regression.
 */
export function InfoTip({
  text,
  align = "center",
  children,
}: {
  text: ReactNode;
  align?: "center" | "left";
  children?: ReactNode;
}) {
  return (
    <span className={`tip${align === "left" ? " tip-left" : ""}`}>
      {children ?? <i className="tip-mark">i</i>}
      <span className="tip-body" role="tooltip">
        {text}
      </span>
    </span>
  );
}

/**
 * A short badge whose fuller meaning is available on hover — the table-cell
 * form of the same rule. `label` must stay scannable at a glance; anything
 * longer belongs in `detail`.
 */
export function BadgeWithDetail({
  label,
  detail,
  tone = "gray",
}: {
  label: string;
  detail: ReactNode;
  tone?: PillTone;
}) {
  return (
    <span className="sub-badge">
      <Pill tone={tone}>{label}</Pill>
      <InfoTip text={detail} align="left" />
    </span>
  );
}
