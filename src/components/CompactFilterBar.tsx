"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, Search, SlidersHorizontal, X } from "lucide-react";
import { InfoTip } from "@/components/ui";

/**
 * COMPACT FILTER BAR
 *
 * One row: search takes the remaining space, each facet is a button that opens
 * its options on click. Replaces the always-visible grid of option pills, which
 * cost six rows of vertical space before a single record was visible and grew
 * with every new facet.
 *
 * An unset facet reads as its name plus a chevron. A set one reads as
 * "name: value" in accent styling with its own clear control, so which filters
 * are active is answerable at a glance rather than by scanning for a
 * highlighted pill.
 *
 * Overflow facets live behind "More filters" rather than extending the row,
 * because a filter row that wraps to three lines is the problem this replaces.
 */

export interface Facet {
  /** Query-string key. */
  key: string;
  label: string;
  options: { value: string; label: string }[];
  /** Multi-select facets store comma-separated values. */
  multi?: boolean;
}

export function CompactFilterBar({
  basePath,
  facets,
  moreFacets = [],
  searchKey = "q",
  searchPlaceholder = "Search…",
  toggle,
}: {
  basePath: string;
  facets: Facet[];
  moreFacets?: Facet[];
  searchKey?: string;
  searchPlaceholder?: string;
  /** A single binary condition worth surfacing outside the facet set. */
  toggle?: { key: string; label: string; tip?: string };
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [open, setOpen] = useState<string | null>(null);
  const [search, setSearch] = useState(params.get(searchKey) ?? "");
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) setOpen(null);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const push = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === "") next.delete(k);
      else next.set(k, v);
    }
    // Any filter change invalidates the current page offset.
    next.delete("page");
    router.push(`${basePath}${next.toString() ? `?${next}` : ""}`);
  };

  const valueOf = (facet: Facet) => params.get(facet.key) ?? "";

  const labelFor = (facet: Facet) => {
    const raw = valueOf(facet);
    if (!raw) return null;
    if (facet.multi) {
      const chosen = raw.split(",").filter(Boolean);
      if (chosen.length === 1) {
        return facet.options.find((o) => o.value === chosen[0])?.label ?? chosen[0];
      }
      return `${chosen.length} selected`;
    }
    return facet.options.find((o) => o.value === raw)?.label ?? raw;
  };

  const toggleOption = (facet: Facet, value: string) => {
    if (!facet.multi) {
      push({ [facet.key]: valueOf(facet) === value ? null : value });
      setOpen(null);
      return;
    }
    const chosen = new Set(valueOf(facet).split(",").filter(Boolean));
    if (chosen.has(value)) chosen.delete(value);
    else chosen.add(value);
    push({ [facet.key]: [...chosen].join(",") || null });
  };

  const activeMoreCount = moreFacets.filter((f) => valueOf(f)).length;
  const anyActive =
    [...facets, ...moreFacets].some((f) => valueOf(f)) ||
    Boolean(params.get(searchKey)) ||
    (toggle ? params.get(toggle.key) === "1" : false);

  const renderFacetButton = (facet: Facet) => {
    const active = labelFor(facet);
    return (
      <div key={facet.key} className="filter-wrap">
        <button
          type="button"
          className={`filter-btn${active ? " active" : ""}`}
          onClick={() => setOpen((o) => (o === facet.key ? null : facet.key))}
        >
          <span>
            {facet.label}
            {active && <span className="filter-val">: {active}</span>}
          </span>
          {active ? (
            <span
              role="button"
              tabIndex={0}
              aria-label={`Clear ${facet.label}`}
              className="filter-clear"
              onClick={(e) => {
                e.stopPropagation();
                push({ [facet.key]: null });
                setOpen(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.stopPropagation();
                  push({ [facet.key]: null });
                }
              }}
            >
              <X size={11} />
            </span>
          ) : (
            <ChevronDown size={12} />
          )}
        </button>

        {open === facet.key && (
          <div className="filter-pop">
            {facet.options.map((o) => {
              const chosen = facet.multi
                ? valueOf(facet).split(",").includes(o.value)
                : valueOf(facet) === o.value;
              return (
                <button
                  key={o.value}
                  type="button"
                  className={`filter-opt${chosen ? " chosen" : ""}`}
                  onClick={() => toggleOption(facet, o.value)}
                >
                  {facet.multi && (
                    <input type="checkbox" readOnly checked={chosen} tabIndex={-1} />
                  )}
                  <span>{o.label}</span>
                </button>
              );
            })}
            {facet.options.length === 0 && (
              <div className="filter-opt muted">Nothing to filter by</div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="filter-bar" ref={barRef}>
      <form
        className="filter-search"
        onSubmit={(e) => {
          e.preventDefault();
          push({ [searchKey]: search.trim() || null });
        }}
      >
        <Search size={14} />
        <input
          value={search}
          placeholder={searchPlaceholder}
          onChange={(e) => setSearch(e.target.value)}
        />
        {search && (
          <button
            type="button"
            className="filter-clear"
            aria-label="Clear search"
            onClick={() => {
              setSearch("");
              push({ [searchKey]: null });
            }}
          >
            <X size={12} />
          </button>
        )}
      </form>

      {facets.map(renderFacetButton)}

      {moreFacets.length > 0 && (
        <div className="filter-wrap">
          <button
            type="button"
            className={`filter-btn${activeMoreCount ? " active" : ""}`}
            onClick={() => setOpen((o) => (o === "__more" ? null : "__more"))}
          >
            <SlidersHorizontal size={12} />
            <span>
              More filters
              {activeMoreCount > 0 && <span className="filter-val"> ({activeMoreCount})</span>}
            </span>
          </button>

          {open === "__more" && (
            <div className="filter-pop wide">
              {moreFacets.map((facet) => (
                <div key={facet.key} className="filter-group">
                  <div className="filter-group-label">{facet.label}</div>
                  {facet.options.map((o) => (
                    <button
                      key={o.value}
                      type="button"
                      className={`filter-opt${valueOf(facet) === o.value ? " chosen" : ""}`}
                      onClick={() =>
                        push({
                          [facet.key]: valueOf(facet) === o.value ? null : o.value,
                        })
                      }
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {toggle && (
        <label className="filter-toggle">
          <input
            type="checkbox"
            checked={params.get(toggle.key) === "1"}
            onChange={(e) => push({ [toggle.key]: e.target.checked ? "1" : null })}
          />
          <span>{toggle.label}</span>
          {toggle.tip && <InfoTip align="left" text={toggle.tip} />}
        </label>
      )}

      {anyActive && (
        <button type="button" className="btn xs ghost" onClick={() => router.push(basePath)}>
          Clear all
        </button>
      )}
    </div>
  );
}
