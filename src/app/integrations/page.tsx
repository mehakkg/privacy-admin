import Link from "next/link";
import { Shell } from "@/components/Shell";
import { PageHead } from "@/components/ui";

export const dynamic = "force-dynamic";

/** Connectors (Settings) — the Integrations landing (nav restructure §3 row 15,
 *  renamed from "Integrations"). The DLP connector detail and the Risk analytics
 *  tab are wired in a later milestone; for now each connector links to its page. */
const CONNECTORS = [
  { name: "miniOrange DLP", type: "DLP", href: "/integrations/dlp", note: "Discovery, classification and scanning source for Data inventory." },
  { name: "Connected systems", type: "Systems", href: "/integrations/connected-systems", note: "The systems the inventory reads from." },
  { name: "Data processors", type: "Processor endpoints", href: "/integrations/data-processors", note: "Third-party processors and their endpoints." },
];

export default function ConnectorsPage() {
  return (
    <Shell active="/integrations" title="Settings / Connectors">
      <PageHead title="Connectors" titleTip="The systems Privacy Admin connects to — discovery, identity, consent and processor endpoints. Connection health shows whether each is answering." />
      <p className="cell-sub" style={{ margin: "0 0 16px" }}>The systems Privacy Admin connects to. See <Link href="/integrations/health" className="row-link">Connection health</Link> for whether each is answering.</p>
      <div className="stack" style={{ gap: 10, maxWidth: 680 }}>
        {CONNECTORS.map((c) => (
          <Link key={c.href} href={c.href} style={{ display: "block", border: "1px solid var(--border)", borderRadius: 8, padding: "12px 14px", textDecoration: "none", color: "inherit" }}>
            <div><strong>{c.name}</strong> <span className="cell-sub">· {c.type}</span></div>
            <div className="cell-sub">{c.note}</div>
          </Link>
        ))}
      </div>
    </Shell>
  );
}
