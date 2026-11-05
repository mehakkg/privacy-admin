import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ProductChip } from "@/components/shell/ProductChip";
import { CROSS_PRODUCT_EVENTS, eventsForSurface, type CrossProductEvent, type Surface } from "@/lib/products/events";

/**
 * Cross-product events (reach-products §7). Every event is written once to the
 * shared audit log tagged with BOTH products — the source product and Privacy.
 * Server-safe; renders from the single events source.
 */
function Chips({ e }: { e: CrossProductEvent }) {
  return (
    <span className="row" style={{ gap: 4, flexShrink: 0 }}>
      <ProductChip product={e.source} syncedAgo={e.at} />
      <ProductChip product="privacy" />
    </span>
  );
}

/** Full panel for the audit log: one row per cross-product event, both chips. */
export function CrossProductEventsPanel() {
  return (
    <div className="xpe-panel">
      <div className="xpe-panel-head">
        <strong>Cross-product events</strong>
        <span className="cell-sub">Each is recorded once in this log, tagged with both products.</span>
      </div>
      {CROSS_PRODUCT_EVENTS.map((e) => (
        <Link key={e.id} href={e.href} className="xpe-row">
          <Chips e={e} />
          <span className="xpe-row-text">{e.audit}</span>
          <span className="cell-sub xpe-row-at">{e.at}</span>
          <ArrowRight size={14} className="xpe-row-arrow" />
        </Link>
      ))}
    </div>
  );
}

/** Compact banner for an affected surface: only that surface's events. */
export function CrossProductBanner({ surface }: { surface: Surface }) {
  const events = eventsForSurface(surface);
  if (events.length === 0) return null;
  return (
    <div className="stack" style={{ gap: 8, marginBottom: 16 }}>
      {events.map((e) => (
        <Link key={e.id} href={e.href} className="xpe-banner">
          <ProductChip product={e.source} syncedAgo={e.at} />
          <span className="xpe-banner-text">
            {e.effect}
            {e.tag && <span className="xpe-tag">{e.tag}</span>}
          </span>
          <span className="xpe-banner-cta">Open {e.objectLabel} <ArrowRight size={13} /></span>
        </Link>
      ))}
    </div>
  );
}
