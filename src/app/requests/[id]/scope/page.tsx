import RetentionPage from "../retention/page";
import LocationsPage from "../locations/page";

export const dynamic = "force-dynamic";

/**
 * TAB 2 — Scope & Retention.
 *
 * The audit's Task 2 (Critical) was "no visibility into exact scope/records
 * before acting" and Task 3 (Critical) was "retention exceptions not surfaced
 * before deletion". Those are one question, not two: what is in scope, and what
 * am I not allowed to touch. Putting them on separate steps let a reader answer
 * the first and act without ever meeting the second.
 *
 * Retention comes first on the page deliberately — it is the blocking gate.
 */
export default async function ScopePage(props: {
  params: Promise<{ id: string }>;
}) {
  return (
    <div className="stack">
      <RetentionPage {...props} />
      <LocationsPage {...props} />
    </div>
  );
}
