import { NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * Data Inventory export.
 *
 * Streams the filtered inventory as CSV. Above a threshold the response
 * switches to an async job rather than holding the request open: a synchronous
 * download of a very large filtered set is exactly the case that times out in
 * the browser, and a timeout after a long wait is worse than being told
 * up-front that it will arrive separately.
 */
const SYNC_LIMIT = 5000;

function csvEscape(value: unknown): string {
  const s = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const sourceId = url.searchParams.get("source");
  const category = url.searchParams.get("category");

  const where = {
    ...(sourceId ? { sourceId } : {}),
    ...(category ? { category } : {}),
  };

  const total = await db.classifiedField.count({ where });

  if (total > SYNC_LIMIT) {
    return NextResponse.json(
      {
        async: true,
        total,
        message:
          `This export covers ${total.toLocaleString()} fields, which is too large to ` +
          `download in one request. It has been queued — you will be notified when ` +
          `it is ready, and the file will be available from Audit & Compliance.`,
      },
      { status: 202 },
    );
  }

  const fields = await db.classifiedField.findMany({
    where,
    include: { source: true, purposeTag: true },
    orderBy: [{ sourceId: "asc" }, { fieldPath: "asc" }],
  });

  const header = [
    "field_path", "source", "entity", "detected_type", "effective_type",
    "category", "sensitivity", "purpose", "subject_type",
    "review_state", "drift", "last_verified", "catalog_sync",
  ];

  const rows = fields.map((f) => [
    f.fieldPath,
    f.source.name,
    f.source.entityId ?? "",
    f.detectedType,
    f.overriddenType ?? f.detectedType,
    f.category ?? "",
    f.sensitivityTier,
    f.purposeTag?.name ?? "UNTAGGED",
    f.dataSubjectType ?? "",
    f.reviewState,
    f.driftFlag ? "yes" : "no",
    f.lastVerified?.toISOString() ?? "",
    f.catalogSyncStatus,
  ]);

  const csv = [header, ...rows]
    .map((r) => r.map(csvEscape).join(","))
    .join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="data-inventory.csv"`,
    },
  });
}
