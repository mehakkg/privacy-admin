"use client";

import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";

/**
 * The one modal pattern for creating a new record anywhere in the product.
 * Fixed, centred, size-tokened (sm/md/lg — pick one per form type, not ad hoc);
 * background locks (no scroll-through); title + close top, actions bottom-right.
 * On a failed submit the caller keeps it open and shows inline errors; on success
 * the caller closes it. Reuse this rather than hand-rolling `.modal-scrim`.
 */
export function Modal({
  title, size = "md", onClose, children, footer, subtitle,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  size?: "sm" | "md" | "lg";
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  // Lock background scroll while open; restore on close.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = prev; document.removeEventListener("keydown", onKey); };
  }, [onClose]);

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className={`modal std-modal ${size}`} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="std-modal-head">
          <div className="stack" style={{ gap: 2 }}>
            <h3 style={{ margin: 0 }}>{title}</h3>
            {subtitle && <span className="cell-sub">{subtitle}</span>}
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>
        <div className="std-modal-body">{children}</div>
        {footer && <div className="std-modal-foot">{footer}</div>}
      </div>
    </div>
  );
}
