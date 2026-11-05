import { ExternalLink } from "lucide-react";
import { ProductChip } from "@/components/shell/ProductChip";
import { productLink } from "@/lib/products/deeplink";
import {
  CONNECTORS, CONN_STATUS_LABEL, CONN_STATUS_TONE,
  ORG_PEOPLE, STATUS_LABEL, type ProductRole,
} from "@/lib/products/org";

/**
 * Organisation › Connectors (reach-products §8). One row per connector with
 * status, tenant, last sync, owner and an Open-in link; plus a Health view with
 * failures-in-24h and the last error. `tab` picks the view.
 */
export function OrgConnectors({ tab }: { tab: "connectors" | "health" }) {
  if (tab === "health") {
    return (
      <div className="inv-card" style={{ padding: 0 }}>
        <table className="inv-table or-table">
          <thead><tr><th>Connector</th><th>Last sync</th><th>Failures (24h)</th><th>Last error</th></tr></thead>
          <tbody>
            {CONNECTORS.map((c) => (
              <tr key={c.key}>
                <td><strong>{c.name}</strong></td>
                <td className="cell-sub">{c.lastSync ?? "—"}</td>
                <td className={c.failures24h > 0 ? "sev-danger" : "cell-sub"}>{c.status === "not_connected" ? "—" : c.failures24h}</td>
                <td className="cell-sub">{c.lastError ?? (c.status === "connected" ? "None" : "—")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  return (
    <div className="inv-card" style={{ padding: 0 }}>
      <table className="inv-table or-table">
        <thead><tr><th>Connector</th><th>Status</th><th>Tenant</th><th>Last sync</th><th>Owner</th><th></th></tr></thead>
        <tbody>
          {CONNECTORS.map((c) => (
            <tr key={c.key}>
              <td>
                <span className="row" style={{ gap: 8, alignItems: "center" }}>
                  {c.product && <ProductChip product={c.product} />}
                  <strong>{c.name}</strong>
                </span>
              </td>
              <td><span className={`inv-status ${CONN_STATUS_TONE[c.status]}`}>{CONN_STATUS_LABEL[c.status]}</span></td>
              <td className="cell-sub">{c.tenant ?? "—"}</td>
              <td className="cell-sub">{c.lastSync ?? "—"}</td>
              <td className="cell-sub">{c.owner ?? "—"}</td>
              <td style={{ textAlign: "right" }}>
                {c.product && c.status === "connected"
                  ? <a href={productLink(c.product, `${c.name} connector`, { label: "Connectors", href: "/settings/organization?tab=connectors" })} className="row-link inv-nowrap">Open in {c.name.replace("miniOrange ", "")} <ExternalLink size={12} /></a>
                  : c.status === "not_connected" ? <button className="btn sec sm">Connect</button> : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RoleCell({ r, product }: { r: ProductRole | null; product: "iam" | "dlp" | "tprm" }) {
  if (!r) return <span className="cell-sub">—</span>;
  return (
    <span className="stack" style={{ gap: 1 }}>
      <span className="row" style={{ gap: 6, alignItems: "center" }}>
        {r.label}
        <a href={productLink(product, `Role · ${r.label}`, { label: "Users & roles", href: "/settings/organization?tab=users" })} className="row-link" style={{ fontSize: 11 }}>Open in {product.toUpperCase()} <ExternalLink size={10} /></a>
      </span>
      {r.mappedFrom && <span className="or-mapped">Mapped from Privacy · {r.mappedFrom}</span>}
    </span>
  );
}

/**
 * Organisation › Users & roles (reach-products §8). People come from IAM — there's
 * no separate user creation here. One row per person, a role column per product;
 * mapped roles carry a tag and can't be raised without that product's admin.
 */
export function OrgUsersRoles() {
  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <p className="cell-sub" style={{ margin: 0, display: "inline-flex", alignItems: "center", gap: 6 }}>
          People come from <ProductChip product="iam" /> — roles are stored per product on the one identity.
        </p>
        <a href={productLink("iam", "Directory picker", { label: "Users & roles", href: "/settings/organization?tab=users" })} className="btn sec sm">Add person</a>
      </div>
      <div className="inv-card" style={{ padding: 0 }}>
        <table className="inv-table or-table">
          <thead><tr><th>Person</th><th>Privacy</th><th>TPRM</th><th>DLP</th><th>IAM</th><th>Status</th></tr></thead>
          <tbody>
            {ORG_PEOPLE.map((p) => (
              <tr key={p.iamId}>
                <td>
                  <span className="row" style={{ gap: 6, alignItems: "center" }}>
                    <strong>{p.name}</strong>
                    <a href={productLink("iam", `Person · ${p.name}`, { label: "Users & roles", href: "/settings/organization?tab=users" })} className="row-link" style={{ fontSize: 11 }}>View in IAM <ExternalLink size={10} /></a>
                  </span>
                </td>
                <td>{p.privacy ? p.privacy.label : <span className="cell-sub">—</span>}</td>
                <td><RoleCell r={p.tprm} product="tprm" /></td>
                <td><RoleCell r={p.dlp} product="dlp" /></td>
                <td><RoleCell r={p.iam} product="iam" /></td>
                <td><span className={`inv-status ${p.status === "active" ? "sev-success" : p.status === "deactivated" ? "sev-danger" : "ok"}`}>{STATUS_LABEL[p.status]}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
