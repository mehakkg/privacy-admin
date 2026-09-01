"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";

/** Search only — this list is short enough that facets would be scaffolding. */
export function SourceSearch({ initial }: { initial: string }) {
  const router = useRouter();
  const [value, setValue] = useState(initial);

  const submit = (next: string) => {
    router.push(next.trim() ? `/discovery/sources?q=${encodeURIComponent(next.trim())}` : "/discovery/sources");
  };

  return (
    <div className="filter-bar">
      <form
        className="filter-search"
        onSubmit={(e) => {
          e.preventDefault();
          submit(value);
        }}
      >
        <Search size={14} />
        <input
          value={value}
          placeholder="Search sources…"
          onChange={(e) => setValue(e.target.value)}
        />
        {value && (
          <button
            type="button"
            className="filter-clear"
            aria-label="Clear search"
            onClick={() => {
              setValue("");
              submit("");
            }}
          >
            <X size={12} />
          </button>
        )}
      </form>
    </div>
  );
}
