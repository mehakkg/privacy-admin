import { PRODUCT_META, type ProductKey } from "@/lib/products/deeplink";

/**
 * Product chip (reach-products §2.4). A 16px tag in the owning product's accent
 * colour, shown wherever DPDP displays data another product owns. Hovering names
 * the source and the last sync time. Pure, server-safe: no client state.
 */
export function ProductChip({ product, syncedAgo }: { product: ProductKey; syncedAgo?: string | null }) {
  const m = PRODUCT_META[product];
  const label = m.name.replace("miniOrange ", "");
  const title = syncedAgo ? `From ${m.name} · synced ${syncedAgo}` : `From ${m.name}`;
  return (
    <span
      title={title}
      style={{
        display: "inline-flex", alignItems: "center", height: 16, padding: "0 6px",
        borderRadius: 4, fontSize: 10.5, fontWeight: 700, letterSpacing: 0.3,
        lineHeight: "16px", color: "#fff", background: m.accent, whiteSpace: "nowrap",
        verticalAlign: "middle",
      }}
    >
      {label}
    </span>
  );
}
