/**
 * SQLite has no array column type, so list-valued fields are persisted as JSON
 * strings in columns named `...Json`. These helpers are the only place that
 * knows about the encoding, so switching the datasource to Postgres (where the
 * columns can become real `String[]`) touches one file.
 */

export function encodeList(values: readonly string[]): string {
  return JSON.stringify(values);
}

export function decodeList(json: string | null | undefined): string[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

export function encodeObject(value: unknown): string {
  return JSON.stringify(value ?? null);
}

export function decodeObject<T = Record<string, unknown>>(
  json: string | null | undefined,
): T | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

/**
 * Deterministic serialisation used for audit hashing: object keys are sorted so
 * the same logical entry always produces the same bytes, and therefore the same
 * hash, regardless of property insertion order.
 */
export function canonicalise(value: unknown): string {
  return JSON.stringify(sortDeep(value));
}

function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value && typeof value === "object" && !(value instanceof Date)) {
    const source = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) out[key] = sortDeep(source[key]);
    return out;
  }
  if (value instanceof Date) return value.toISOString();
  return value;
}
