import Link from "next/link";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

const PRODUCT: Record<string, { name: string; desc: string; accent: string }> = {
  iam: { name: "miniOrange IAM", desc: "Identity, sign-in and access", accent: "#7c3aed" },
  dlp: { name: "miniOrange DLP", desc: "Data discovery, classification and policies", accent: "#0891b2" },
  tprm: { name: "miniOrange TPRM", desc: "Vendor risk, assessments and monitoring", accent: "#ea580c" },
};

/**
 * Holding page for a product whose portal URL isn't configured (reach-products
 * §2.1 / §2.3). It names the product and, when a deep link carried an `object`
 * and a `from` context, the exact object it would open and the place to return
 * to — standing in for the real portal's object page + return bar. Never a 404.
 */
export default async function SwitchHolding({
  params,
  searchParams,
}: {
  params: Promise<{ product: string }>;
  searchParams: Promise<{ object?: string; from?: string; fromHref?: string }>;
}) {
  const { product } = await params;
  const sp = await searchParams;
  // TPRM has a working nav prototype in this repo — open it instead of the
  // "not connected" holding page.
  if (product === "tprm") redirect("/tprm-console");
  const p = PRODUCT[product] ?? { name: "this product", desc: "", accent: "#2563eb" };
  const backHref = sp.fromHref || "/home";
  const backLabel = sp.from ? `← Back to ${sp.from} in Privacy` : "← Back to miniOrange Privacy";

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "var(--surface-sunken,#f8fafc)", padding: 16 }}>
      <div style={{ maxWidth: 440, textAlign: "center" }} className="stack">
        <span style={{ width: 48, height: 48, borderRadius: 12, background: p.accent, display: "grid", placeItems: "center", margin: "0 auto 8px" }} />
        <h1 className="inv-title" style={{ margin: 0 }}>{p.name}</h1>
        {sp.object ? (
          <p className="cell-sub" style={{ margin: 0 }}>
            Opening <strong>{sp.object}</strong>
          </p>
        ) : p.desc ? (
          <p className="cell-sub" style={{ margin: 0 }}>{p.desc}</p>
        ) : null}
        <p className="cell-sub" style={{ marginTop: 8 }}>
          {p.name} opens here. In production this is the {p.name.replace("miniOrange ", "")} console
          {sp.object ? ", on the exact object above," : ""} in the same session.
        </p>
        <div><Link href={backHref} className="btn primary">{backLabel}</Link></div>
      </div>
    </div>
  );
}
