import Link from "next/link";
import { ArrowLeft, Search, Bell, Settings } from "lucide-react";
import type { ProductKey } from "@/lib/products/deeplink";
import { SWITCH_META } from "@/lib/products/switch";
import { CONSOLE_NAV } from "@/lib/products/consoleNav";
import { ConsoleSwitcher } from "@/components/console/ConsoleSwitcher";
import { initialsOf } from "@/lib/products/people";

/**
 * Full-page shell for an external product console (DLP / IAM). A navy sidebar
 * with the product switcher + a representative static nav, a header matching the
 * Privacy shell (search · bell · settings · avatar), and a body. When the viewer
 * arrived from a Privacy deep link (`from`), a return bar sits above the body and
 * the opened object is named — standing in for the real console's object page.
 */
export function ExternalConsole({
  product,
  products,
  viewerName,
  object,
  from,
  fromHref,
}: {
  product: Exclude<ProductKey, "privacy" | "tprm">;
  products: ProductKey[];
  viewerName: string;
  object?: string;
  from?: string;
  fromHref?: string;
}) {
  const meta = SWITCH_META[product];
  const sections = CONSOLE_NAV[product];
  const activeLabel = sections[0]?.items[0]?.label; // Dashboard, unless a deep link
  const shortName = meta.name.replace("miniOrange ", "");

  return (
    <div className="xc">
      <aside className="tn-side">
        <ConsoleSwitcher current={product} products={products} />
        <nav className="tn-nav">
          {sections.map((s, si) => (
            <div key={s.label ?? `top-${si}`} className="tn-group">
              {s.label && <div className="tn-group-head" style={{ cursor: "default" }}>{s.label}</div>}
              {s.items.map((it) => {
                const isActive = !object && it.label === activeLabel;
                return (
                  <div key={it.label} className={`tn-row${isActive ? " active" : ""}`}>
                    <span className="tn-row-label">{it.label}</span>
                    {it.badge ? <span className="tn-badge">{it.badge}</span> : null}
                  </div>
                );
              })}
            </div>
          ))}
        </nav>
      </aside>

      <div className="tn-main">
        <header className="tn-top">
          <span className="tn-top-left"><Search size={15} /> <span className="cell-sub">Search</span></span>
          <span className="tn-top-right">
            <Bell size={16} />
            <Settings size={16} />
            <span className="tn-avatar">{initialsOf(viewerName)}</span>
          </span>
        </header>

        {from && (
          <div className="xc-return">
            <Link href={fromHref || "/home"} className="row-link"><ArrowLeft size={14} /> Back to {from} in Privacy</Link>
          </div>
        )}

        <div className="tn-body">
          <div className="stack" style={{ gap: 10, maxWidth: 640 }}>
            <div className="row" style={{ gap: 10, alignItems: "center" }}>
              <span className="xc-mark" style={{ background: meta.accent }}>{shortName.charAt(0)}</span>
              <div>
                <h1 className="inv-title" style={{ margin: 0 }}>{meta.name}</h1>
                <p className="cell-sub" style={{ margin: 0 }}>{meta.desc}</p>
              </div>
            </div>
            {object ? (
              <div className="xc-object">
                Opening <strong>{object}</strong>
                <p className="cell-sub" style={{ margin: "4px 0 0" }}>In production this is the exact {shortName} object, in the same session.</p>
              </div>
            ) : (
              <p className="cell-sub" style={{ margin: 0 }}>
                This is a navigation prototype of the {shortName} console, reached through the product switcher.
                The sidebar shows a typical admin&rsquo;s full nav; use the switcher at the top to return to Privacy or move to another product.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
