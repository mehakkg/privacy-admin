import { createHash } from "node:crypto";

/**
 * Canonical content of a consent artifact and its hash. ONE definition, used both
 * to store the hash at creation and to recompute it during a spot-check — so a
 * match proves the stored content is byte-for-byte what was hashed originally.
 * (This is the verify layer; the immutability enforcement itself lives elsewhere.)
 */
export interface ConsentArtifactContent {
  subjectRef: string;
  purposeTagId: string | null;
  channelOrigin: string;
  status: string;
  collectedAt: Date;
}

export function canonicalConsent(c: ConsentArtifactContent): string {
  return [c.subjectRef, c.purposeTagId ?? "", c.channelOrigin, c.status, c.collectedAt.toISOString()].join("|");
}

export function hashConsent(c: ConsentArtifactContent): string {
  return "sha256:" + createHash("sha256").update(canonicalConsent(c)).digest("hex");
}
