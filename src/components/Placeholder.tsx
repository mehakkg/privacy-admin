import type { ReactNode } from "react";
import { PageHead } from "@/components/ui";

/**
 * A placed-but-unbuilt screen. The revised navigation reserves a structural home
 * for capabilities whose full specs are separate follow-on documents; this makes
 * that home real and honest — the section exists, its purpose is stated, and it
 * does not pretend to have a screen it does not yet have.
 */
export function Placeholder({
  title,
  tip,
  what,
  children,
}: {
  title: string;
  tip?: string;
  /** One or two sentences on what this screen will do, from the nav spec. */
  what: ReactNode;
  children?: ReactNode;
}) {
  return (
    <>
      <PageHead title={title} titleTip={tip} />
      <div className="card" style={{ marginTop: 8 }}>
        <div className="card-body">
          <div className="row" style={{ gap: 8, marginBottom: 8 }}>
            <span className="pill gray"><span className="dot" />Placeholder</span>
            <span className="cell-sub">Full screen spec is a follow-on document.</span>
          </div>
          <p style={{ margin: 0, maxWidth: 640 }}>{what}</p>
          {children}
        </div>
      </div>
    </>
  );
}
