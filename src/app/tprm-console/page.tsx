import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { TprmNavDemo } from "@/components/tprm-nav/TprmNavDemo";

export const dynamic = "force-dynamic";

/**
 * TPRM left-navigation prototype (tprm-nav spec). The TPRM console and vendor
 * portal are a separate product; this is a self-contained, permission-driven nav
 * demo inside the Privacy repo. One nav config, filtered by the signed-in role's
 * permissions — switch the Acting-as person and the flags to see the computed
 * sidebar, badges, the ⚙ gear, the settings shell and the no-access page.
 */
export default function TprmConsolePage() {
  return (
    <div className="tn-page">
      <Link href="/home" className="row-link" style={{ display: "inline-flex", alignItems: "center", gap: 4, marginBottom: 12 }}>
        <ArrowLeft size={14} /> Back to miniOrange Privacy
      </Link>
      <header className="tn-page-head">
        <h1 className="inv-title">TPRM navigation</h1>
        <p className="cell-sub" style={{ margin: 0 }}>
          One nav config, filtered by permissions — Administrator, Risk Manager, Risk Analyst and the vendor portal. No per-role menus in code.
        </p>
      </header>
      <TprmNavDemo />
    </div>
  );
}
