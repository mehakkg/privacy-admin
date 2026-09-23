import { NextResponse } from "next/server";
import { getConsentApiPayload } from "@/lib/engines/consentInfra";

export const dynamic = "force-dynamic";

/**
 * The Universal Consent API — returns the granular, timestamped, purpose-specific
 * record for one artifact. The Integrity Dashboard's API-retrievability spot-check
 * calls the SAME getConsentApiPayload() so what it shows is exactly what the API
 * returns.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const payload = await getConsentApiPayload(id);
  if (!payload) return NextResponse.json({ error: "artifact_not_found" }, { status: 404 });
  return NextResponse.json(payload);
}
