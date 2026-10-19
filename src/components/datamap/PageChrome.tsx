import Link from "next/link";
import type { ReactNode } from "react";
import { DATAMAP_ROUTES, type DataMapStage } from "@/lib/datamap/routes";
import type { ReadinessStripData } from "@/lib/engines/datamap";
import { plural } from "@/lib/datamap/foundations";

/**
 * Shared chrome for the four Data map pages (M1). One container width, one header
 * shape, one "Path to ROPA" strip — so the pages read as one system. Server
 * components; pass page actions as `actions` (they right-align and never wrap).
 */

export function PageContainer({ children }: { children: ReactNode }) {
  return <div className="dm-container">{children}</div>;
}

export function PageHeader({ title, status, actions }: { title: string; status?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="dm-header">
      <div className="dm-header-main">
        <h1 className="dm-title">{title}</h1>
        {status != null && <div className="dm-status cell-sub">{status}</div>}
      </div>
      {actions != null && <div className="dm-actions">{actions}</div>}
    </header>
  );
}

/** The 44px band under every Data map header. Three stages, three units; the
 *  current page's stage is bold. "ready" is used for activities only. */
export function ReadinessStrip({ data, current }: { data: ReadinessStripData; current: DataMapStage }) {
  const stages: { key: DataMapStage; href: string; text: string }[] = [
    { key: "fields", href: DATAMAP_ROUTES.inventory, text: `Fields: ${data.fields.complete} of ${data.fields.total} complete` },
    { key: "activities", href: DATAMAP_ROUTES.activities, text: `Activities: ${data.activities.ready} of ${data.activities.total} ready` },
    { key: "ropa", href: DATAMAP_ROUTES.ropa, text: `ROPA: ${plural(data.ropa.entries, "entry", "entries")}` },
  ];
  return (
    <nav className="dm-strip" aria-label="Path to ROPA">
      <span className="dm-strip-label">Path to ROPA</span>
      {stages.map((s, i) => (
        <span key={s.key} className="dm-strip-stage">
          {i > 0 && <span className="dm-strip-arrow" aria-hidden="true">→</span>}
          <Link href={s.href} className={`dm-strip-link${current === s.key ? " on" : ""}`} aria-current={current === s.key ? "step" : undefined}>{s.text}</Link>
        </span>
      ))}
    </nav>
  );
}
