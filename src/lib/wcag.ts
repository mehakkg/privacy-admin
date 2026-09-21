/**
 * WCAG 2.1 contrast. Used to hard-block a branding primary color that would be
 * unreadable on Data-Principal-facing surfaces — matching the product's own
 * light-default / WCAG-compliant theme bar.
 */

export function normalizeHex(input: string): string | null {
  let h = input.trim().replace(/^#/, "");
  if (/^[0-9a-fA-F]{3}$/.test(h)) h = h.split("").map((c) => c + c).join("");
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  return `#${h.toLowerCase()}`;
}

function toRgb(hex: string): [number, number, number] | null {
  const h = normalizeHex(hex);
  if (!h) return null;
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

function luminance([r, g, b]: [number, number, number]): number {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** Contrast ratio (1–21) between two hex colors, or null if either is invalid. */
export function contrastRatio(a: string, b: string): number | null {
  const ra = toRgb(a);
  const rb = toRgb(b);
  if (!ra || !rb) return null;
  const la = luminance(ra);
  const lb = luminance(rb);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

export const AA_NORMAL = 4.5;
export const AA_LARGE = 3;

/** True when `color` on a white surface meets AA for normal text (the readable
 *  pairing used in the notice preview: coloured text/accents on white, and white
 *  text on a coloured header — both governed by this same ratio). */
export function meetsAAOnWhite(color: string): boolean {
  const r = contrastRatio(color, "#ffffff");
  return r !== null && r >= AA_NORMAL;
}

export function ratioOnWhite(color: string): number | null {
  return contrastRatio(color, "#ffffff");
}
