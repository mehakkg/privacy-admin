"use client";

/**
 * PDF export goes through the browser's own print dialogue against the print
 * stylesheet in globals.css, rather than a PDF library.
 *
 * Deliberate: the evidence pack is already a rendered document, and a second
 * rendering path is a second thing that can disagree with the record. Noted in
 * the README as a deviation from "export to PDF".
 */
export function PrintButton() {
  return (
    <button className="btn primary" onClick={() => window.print()}>
      Export PDF (print)
    </button>
  );
}
