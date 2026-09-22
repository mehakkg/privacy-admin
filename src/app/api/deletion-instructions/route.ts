import { NextResponse } from "next/server";
import { createDeletionInstruction } from "@/lib/engines/scenario3";

export const dynamic = "force-dynamic";

/**
 * The SHARED deletion-instruction interface. A future Rights/DSR (Scenario 1)
 * module writes into this same endpoint/table rather than inventing a second,
 * parallel deletion-request object. Creating an instruction here immediately
 * runs the retention-conflict check.
 *
 * Body: { customerId, scope, source, deadline? }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!body.customerId || !body.scope || !body.source) {
      return NextResponse.json({ ok: false, error: "customerId, scope and source are required." }, { status: 400 });
    }
    const instruction = await createDeletionInstruction({
      customerId: body.customerId,
      scope: body.scope,
      source: body.source,
      deadline: body.deadline ?? null,
    });
    return NextResponse.json({ ok: true, id: instruction.id, status: instruction.status, conflict: Boolean(instruction.conflict) }, { status: 201 });
  } catch (error) {
    const e = error as Error;
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
