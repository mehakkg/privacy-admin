import { NextResponse } from "next/server";
import { searchMaskingConfigLog } from "@/lib/engines/masking";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/admin/config-audit-log?search=&action=&from=&to=
 *
 * The masking config change log — a scoped view of the one immutable, hash-chained
 * audit trail, not a second log. Screen 5 reuses the Unified Audit Log Search
 * pointed here.
 */
export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const entries = await searchMaskingConfigLog({
    search: p.get("search") || undefined,
    action: p.get("action") || undefined,
    actorRole: p.get("actorRole") || undefined,
    from: p.get("from") ? new Date(p.get("from")!) : undefined,
    to: p.get("to") ? new Date(`${p.get("to")}T23:59:59Z`) : undefined,
    take: 300,
  });
  return NextResponse.json({ entries });
}
