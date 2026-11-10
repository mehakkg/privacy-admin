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
        display: "inline-flex", alignItems: "center", height: 17, padding: "0 6px",
        borderRadius: 4, fontSize: 11, fontWeight: 700, letterSpacing: 0.3,
        // Darken the product accent so white text clears WCAG AA (the raw cyan /
        // orange accents fail at this size).
        lineHeight: "17px", color: "#fff", background: `color-mix(in srgb, ${m.accent} 76%, #000)`,
        whiteSpace: "nowrap", verticalAlign: "middle",
      }}
    >
      {label}
    </span>
  );
}
