import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { simulateConcurrentEdit } from "@/lib/engines/masking";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/admin/masking-rules/:id/simulate-concurrent
 *
 * DEMO DEVICE for Screen 3. Bumps a rule's version server-side as if another
 * admin saved. It is a plain API route, NOT a server action, on purpose: a
 * server action would auto-revalidate the edit route and quietly refresh the
 * form to the new version, which is exactly the stale state the conflict test
 * needs to preserve. `fetch` from the client leaves the form's loaded version
 * untouched, so the next Save is cleanly rejected.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { actor } = await getSession();
  try {
    await simulateConcurrentEdit(id, actor);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const err = e as Error;
    return NextResponse.json({ ok: false, error: err.message, errorKind: err.name }, { status: 400 });
  }
}
