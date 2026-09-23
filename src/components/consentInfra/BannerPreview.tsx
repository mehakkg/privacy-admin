import { Pill } from "@/components/ui";
import type { BannerModel } from "@/lib/cookieCompliance";

/** A rendered cookie-banner preview for a given compliance model + language. */
export function BannerPreview({ banner, language, fallback }: { banner: BannerModel; language: string; fallback?: boolean }) {
  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden", maxWidth: 520 }}>
      <div style={{ padding: "8px 14px", background: "var(--bg-muted)", display: "flex", gap: 8, alignItems: "center" }}>
        <Pill tone={banner.tone} dot={false}>{banner.label}</Pill>
        <span className="cell-sub">Language: {language}</span>
        {fallback && <Pill tone="yellow" dot={false}>fallback</Pill>}
      </div>
      <div style={{ padding: 16 }}>
        <h3 style={{ margin: "0 0 6px", fontSize: 15 }}>{banner.heading}</h3>
        <p className="cell-sub" style={{ margin: "0 0 12px" }}>{banner.body}</p>
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          {banner.buttons.map((b, i) => (
            <span key={b} className={`btn sm${i === 0 ? " primary" : i === banner.buttons.length - 1 ? " ghost" : ""}`} style={{ pointerEvents: "none" }}>{b}</span>
          ))}
        </div>
      </div>
      <div style={{ padding: "8px 14px", background: "var(--bg-muted)" }}>
        <span className="cell-sub">{banner.note}</span>
      </div>
    </div>
  );
}
