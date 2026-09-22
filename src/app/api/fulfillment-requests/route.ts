import { NextResponse } from "next/server";
import { createFulfillmentRequest } from "@/lib/engines/fulfillment";

export const dynamic = "force-dynamic";

/**
 * Intake interface for the Grievance module: it POSTs a validated erasure here
 * (source grievance_escalation). Defined now even though the Grievance UI does
 * not exist yet — it writes into this same shape. Creating the request also
 * creates its shared DeletionInstruction and runs the retention check.
 *
 * Body: { customerId, scope, deadline? }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const req = await createFulfillmentRequest({ source: "grievance_escalation", customerId: body.customerId, scope: body.scope, deadline: body.deadline ?? null });
    return NextResponse.json({ ok: true, id: req.id, status: req.status }, { status: 201 });
  } catch (error) {
    const e = error as Error;
    return NextResponse.json({ ok: false, error: e.message }, { status: e.name === "ValidationError" ? 400 : 500 });
  }
}
