import { NextResponse } from "next/server";
import { resolveEffective } from "@/lib/engines/masking";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/admin/masking-rules/effective?code=MOBILE_NUMBER
 *
 * The effective masking for a field, resolved across the tenant's associated
 * templates (tenant → regional → BASELINE). Screen 1 renders this exact payload,
 * calling the same resolveEffective(), so the UI can never drift from the API.
 * `editableRuleId` / `editableRuleVersion` are what the edit link is built from.
 */
export async function GET(req: Request) {
  const code = new URL(req.url).searchParams.get("code");
  if (!code) return NextResponse.json({ error: "missing_code" }, { status: 400 });
  const resolution = await resolveEffective(code);
  const status = resolution.status === "not_found" ? 404 : 200;
  return NextResponse.json(resolution, { status });
}
