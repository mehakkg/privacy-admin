import Link from "next/link";

export const dynamic = "force-dynamic";

const PRODUCT: Record<string, { name: string; desc: string; accent: string }> = {
  iam: { name: "miniOrange IAM", desc: "Identity, sign-in and access", accent: "#7c3aed" },
  dlp: { name: "miniOrange DLP", desc: "Data discovery, classification and policies", accent: "#0891b2" },
  tprm: { name: "miniOrange TPRM", desc: "Vendor risk, assessments and monitoring", accent: "#ea580c" },
};

/** Holding page for a product whose portal URL isn't configured (reach-products
 *  §2.1) — it names the product rather than 404-ing. */
export default async function SwitchHolding({ params }: { params: Promise<{ product: string }> }) {
  const { product } = await params;
  const p = PRODUCT[product] ?? { name: "this product", desc: "", accent: "#2563eb" };
  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "var(--surface-sunken,#f8fafc)", padding: 16 }}>
      <div style={{ maxWidth: 420, textAlign: "center" }} className="stack">
        <span style={{ width: 48, height: 48, borderRadius: 12, background: p.accent, display: "grid", placeItems: "center", margin: "0 auto 8px" }} />
        <h1 className="inv-title" style={{ margin: 0 }}>{p.name}</h1>
        {p.desc && <p className="cell-sub" style={{ margin: 0 }}>{p.desc}</p>}
        <p className="cell-sub" style={{ marginTop: 8 }}>This portal isn’t connected in this demo. In production, switching here opens {p.name} with the same session.</p>
        <div><Link href="/home" className="btn primary">← Back to miniOrange Privacy</Link></div>
      </div>
    </div>
  );
}
