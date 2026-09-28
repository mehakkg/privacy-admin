"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";

/**
 * Screen 1 lookup — search by code or name, or pick from the list. Selecting a
 * field navigates to ?code=…, so the resolution is server-rendered (and shares one
 * code path with the API) rather than fetched into client state.
 */
export function FieldPicker({
  fields,
  selected,
}: {
  fields: { code: string; name: string; custom: boolean }[];
  selected: string | null;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const matches = needle
    ? fields.filter((f) => f.code.toLowerCase().includes(needle) || f.name.toLowerCase().includes(needle))
    : fields;

  const go = (code: string) => router.push(`/masking/fields?code=${encodeURIComponent(code)}`);

  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="row" style={{ gap: 6, alignItems: "center" }}>
        <Search size={15} className="muted" />
        <input
          className="input"
          style={{ flex: 1 }}
          placeholder="Search a field by code or name…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      <div className="stack" style={{ gap: 2, maxHeight: 420, overflowY: "auto" }}>
        {matches.map((f) => (
          <button
            key={f.code}
            className={`pick-row${selected === f.code ? " active" : ""}`}
            onClick={() => go(f.code)}
            style={{ textAlign: "left", cursor: "pointer", width: "100%" }}
          >
            <div className="cell-stack">
              <span className="cell-primary mono">{f.code}</span>
              <span className="cell-sub">{f.name}{f.custom ? " · custom" : ""}</span>
            </div>
          </button>
        ))}
        {matches.length === 0 && <div className="empty">No field matches “{q}”.</div>}
      </div>
    </div>
  );
}
