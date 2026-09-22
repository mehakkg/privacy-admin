import { NextResponse } from "next/server";
import { createEvidenceRequest } from "@/lib/engines/scenario3";

export const dynamic = "force-dynamic";

/**
 * Intake interface for the Grievance module: it POSTs an evidence request here
 * rather than owning evidence logic. Defined now even though the Grievance UI
 * doesn't exist yet — the same interface-boundary discipline as the shared
 * DeletionInstruction. Admin can also log a request manually in the UI.
 *
 * Body: { requestedBy, customerId, claimedEvent, dateFrom?, dateTo?, eventTypeHint? }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const created = await createEvidenceRequest({
      requestedBy: body.requestedBy ?? "Grievance Officer",
      customerId: body.customerId,
      claimedEvent: body.claimedEvent,
      dateFrom: body.dateFrom ?? null,
      dateTo: body.dateTo ?? null,
      eventTypeHint: body.eventTypeHint ?? null,
      source: "api",
    });
    return NextResponse.json({ ok: true, id: created.id }, { status: 201 });
  } catch (error) {
    const e = error as Error;
    return NextResponse.json({ ok: false, error: e.message }, { status: e.name === "ValidationError" ? 400 : 500 });
  }
}
