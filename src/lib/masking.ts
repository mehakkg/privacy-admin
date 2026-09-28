/**
 * DYNAMIC DATA MASKING — pure, client-safe shared layer.
 *
 * Constants, labels and the masking-function executor (`runMaskCore`) that the
 * engine and the browser both call, so the live preview a user types against is
 * genuinely the same code path the resolver reports — not a look-alike. No
 * `node:crypto`, no `@/lib/db` import here, so a client component can pull it in
 * without dragging the server bundle across the boundary.
 */

export const MASKING_TIERS = ["tenant", "regional", "baseline"] as const;
export type MaskingTier = (typeof MASKING_TIERS)[number];

/** Higher precedence wins. Two associated regional templates tie at 10 → ambiguity. */
export const TIER_PRECEDENCE: Record<MaskingTier, number> = {
  baseline: 0,
  regional: 10,
  tenant: 20,
};

export const TIER_LABEL: Record<string, string> = {
  baseline: "BASELINE",
  regional: "Regional",
  tenant: "Tenant Rule",
};

export const TIER_TONE: Record<string, "blue" | "purple" | "gray"> = {
  baseline: "gray",
  regional: "blue",
  tenant: "purple",
};

/**
 * A tier badge that names the regional source, e.g. "Regional: DPDP", so a
 * regional winner is never confused for a generic one. Baseline and tenant read
 * as themselves.
 */
export function tierBadge(tier: string, templateName: string): string {
  if (tier === "regional") return `Regional: ${templateName}`;
  return TIER_LABEL[tier] ?? tier;
}

// --- Lock treatments (Screen 2) --------------------------------------------

export const LOCK = {
  system_regulated: {
    label: "System-regulated",
    tone: "red" as const,
    icon: "shield" as const,
    citation:
      "Owned by SUPER_ADMIN. No tenant, including yours, can edit, override, or unlock this.",
  },
  self_locked: {
    label: "Self-locked",
    tone: "yellow" as const,
    icon: "lock" as const,
    // {who}/{date} filled in from the rule.
    citation: "Locked by {who} on {date}. You can unlock this anytime.",
  },
} as const;

// --- Masking functions (ddm-masking-core) ----------------------------------

export const CUSTOM_FN = "custom_fn";
export const CUSTOM_FUNCTION_NOT_EXECUTABLE = "CUSTOM_FUNCTION_NOT_EXECUTABLE_BY_PDP";

export interface MaskMethod {
  key: string;
  label: string;
  /** One-line description of what the function does, for the picker + card. */
  blurb: string;
}

export const MASK_METHODS: MaskMethod[] = [
  { key: "last4", label: "Mask all but last 4", blurb: "Reveal the final four characters, mask the rest." },
  { key: "last4x", label: "Mask all but last 4 (X)", blurb: "Reveal the final four, mask the rest with X." },
  { key: "first2last2", label: "Mask the middle", blurb: "Reveal the first two and last two characters." },
  { key: "fullmask", label: "Full mask", blurb: "Mask every character." },
  { key: "email", label: "Email — preserve domain", blurb: "Reveal the first letter and the domain only." },
  { key: "alpha_x", label: "Mask letters, keep digits", blurb: "Replace letters with X, leave digits in place." },
  { key: CUSTOM_FN, label: "Tenant custom function", blurb: "A tenant-supplied function — not executable in preview." },
];

export const METHOD_LABEL: Record<string, string> = Object.fromEntries(
  MASK_METHODS.map((m) => [m.key, m.label]),
);

export type MaskResult =
  | { ok: true; output: string }
  | { ok: false; code: string; message: string };

function maskChars(value: string, keep: (i: number, len: number) => boolean, fill = "*"): string {
  const len = value.length;
  return value
    .split("")
    .map((ch, i) => (keep(i, len) ? ch : fill))
    .join("");
}

/**
 * Run a masking function against a value — the real executor.
 *
 * A tenant custom function returns the honest degraded state rather than a
 * fabricated preview: the PDP cannot run tenant code, and pretending otherwise
 * is exactly the dishonesty this console refuses.
 */
export function runMaskCore(method: string, value: string): MaskResult {
  if (method === CUSTOM_FN) {
    return {
      ok: false,
      code: CUSTOM_FUNCTION_NOT_EXECUTABLE,
      message:
        "This rule uses a tenant custom function. The preview engine cannot execute tenant code, so no output is shown here — the function still runs in enforcement.",
    };
  }
  if (!value) return { ok: true, output: "" };

  switch (method) {
    case "last4":
      return { ok: true, output: maskChars(value, (i, len) => i >= len - 4) };
    case "last4x":
      return { ok: true, output: maskChars(value, (i, len) => i >= len - 4, "X") };
    case "first2last2":
      return { ok: true, output: maskChars(value, (i, len) => i < 2 || i >= len - 2) };
    case "fullmask":
      return { ok: true, output: maskChars(value, () => false) };
    case "email": {
      const at = value.indexOf("@");
      if (at <= 0) return { ok: true, output: maskChars(value, (i) => i === 0) };
      const local = value.slice(0, at);
      const domain = value.slice(at); // includes "@"
      const maskedLocal = maskChars(local, (i) => i === 0);
      return { ok: true, output: maskedLocal + domain };
    }
    case "alpha_x":
      return {
        ok: true,
        output: value.replace(/[A-Za-z]/g, "X"),
      };
    default:
      return { ok: false, code: "UNKNOWN_METHOD", message: `No masking function named "${method}".` };
  }
}

/** "9876543210 → ******3210" — the appendix's example format, or the degraded code. */
export function maskExample(method: string, value: string): string {
  const r = runMaskCore(method, value);
  if (r.ok) return `${value} → ${r.output}`;
  return r.code;
}

// --- Resolution result shape (shared by the API route and the page) ---------

export interface ResolutionStep {
  templateKey: string;
  templateName: string;
  tier: string;
  precedence: number;
  ruleId: string;
  method: string;
  maskExample: string;
  won: boolean;
  /** Why this step sits where it does in the precedence order. */
  reason: string;
  editable: boolean;
  lockType: string;
  regulated: boolean;
  ownedBy: string;
  lockedBy: string | null;
  lockedAt: string | null;
  statutoryCitation: string | null;
  version: number;
}

/** A field code already claimed by an associated regional template (Screen 4). */
export interface Collision {
  templateName: string;
  templateKey: string;
  ruleId: string;
  method: string;
}

export interface EffectiveResolution {
  code: string;
  fieldName: string;
  sampleValue: string;
  status: "resolved" | "ambiguous" | "not_found";
  winner: ResolutionStep | null;
  chain: ResolutionStep[];
  /** Present only when status === "ambiguous". */
  ambiguity: { sources: { templateName: string; ruleId: string }[] } | null;
  /** The rule a user could edit, if the winner is editable and reachable. */
  editableRuleId: string | null;
  editableRuleVersion: number | null;
}
