/**
 * Unit tests for the versions + conflict model (M1). Run with the same harness as
 * logic.test.ts: `npx tsx src/lib/activities/versions.test.ts`. The combined
 * "npm test" runs both files.
 */
import {
  canonicalJson, buildSnapshot, sha256Hex8, verifyRecord, diffSnapshots, resolveWrite,
  type SnapshotInput, type LastWriter,
} from "./versions";

let pass = 0, fail = 0;
function check(name: string, cond: boolean) { if (cond) pass++; else { fail++; console.error("FAIL: " + name); } }
function eq<T>(name: string, got: T, want: T) { check(`${name} — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`, JSON.stringify(got) === JSON.stringify(want)); }

// --- canonical JSON ---------------------------------------------------------
eq("canonical sorts keys", canonicalJson({ b: 1, a: 2 }), '{"a":2,"b":1}');
eq("canonical sorts nested", canonicalJson({ z: { y: 1, x: 2 } }), '{"z":{"x":2,"y":1}}');
eq("canonical keeps array order", canonicalJson([3, 1, 2]), "[3,1,2]");

// --- snapshot is order-independent -----------------------------------------
const base: SnapshotInput = {
  name: "Payroll", description: "Salary processing", owner: "R. Iyer", department: "HR", entity: null,
  principals: ["employees", "customers"], reviewPeriodMonths: 12, nextReviewDue: "2027-10-08",
  purposes: [
    { purposeId: "p2", approvedVersion: 1, legalBasis: "legitimate_use", retention: "7 years", noProcessor: false,
      data: [{ fieldId: "f2", path: "hr.pan", dataType: "PAN", sensitivity: "Restricted" }, { fieldId: "f1", path: "hr.name", dataType: "Name", sensitivity: "Internal" }],
      processors: [{ vendor: "Snowflake", country: "US" }] },
    { purposeId: "p1", approvedVersion: 2, legalBasis: "consent", retention: "3 years", noProcessor: true, data: [], processors: [] },
  ],
};
// Same data, different array order → identical snapshot bytes.
const reordered: SnapshotInput = {
  ...base,
  principals: ["customers", "employees"],
  purposes: [base.purposes[1], { ...base.purposes[0], data: [base.purposes[0].data[1], base.purposes[0].data[0]] }],
};
eq("snapshot is order-independent", buildSnapshot(base), buildSnapshot(reordered));
check("snapshot changes with content", buildSnapshot(base) !== buildSnapshot({ ...base, owner: "K. Menon" }));

// --- hash + verify ----------------------------------------------------------
(async () => {
  const snap = buildSnapshot(base);
  const h = await sha256Hex8(snap);
  eq("hash is 8 hex chars", /^[0-9a-f]{8}$/.test(h), true);
  eq("hash is stable", await sha256Hex8(snap), h);
  eq("verify matches stored snapshot", await verifyRecord(snap, h), true);
  // Tamper: the stored snapshot string is changed but the hash stays → mismatch.
  const tampered = snap.replace("Payroll", "Payroll (edited)");
  eq("verify catches a tampered record", await verifyRecord(tampered, h), false);

  // --- diff -----------------------------------------------------------------
  const v2 = buildSnapshot({ ...base, owner: "K. Menon", purposes: [base.purposes[0], base.purposes[1], { purposeId: "p3", approvedVersion: 1, legalBasis: "consent", retention: "1 year", noProcessor: true, data: [], processors: [] }] });
  const d = diffSnapshots(buildSnapshot(base), v2);
  eq("diff: owner changed", d.changed.includes("Owner"), true);
  eq("diff: purpose added", d.added.includes("Purpose p3"), true);
  eq("diff: nothing removed", d.removed, []);

  // --- conflict model -------------------------------------------------------
  const me = "sess-A";
  const them: LastWriter = { sessionId: "sess-B", by: "A. Rao", at: "2026-10-08T10:42:00Z", fields: ["owner"] };

  // 20 same-session writes give 0 conflicts (each sees the previous rev).
  let conflicts = 0, rev = 0;
  for (let i = 0; i < 20; i++) {
    const baseRev = rev; // editor saw the current rev before typing
    const out = resolveWrite({ baseRev, currentRev: rev, lastWriter: { sessionId: me, by: "R. Iyer", at: "t", fields: ["owner"] }, sessionId: me, fields: ["owner"] });
    if (out.action === "conflict") conflicts++;
    rev++; // the write lands, rev advances
  }
  eq("20 same-session writes -> 0 conflicts", conflicts, 0);

  // Two sessions on DIFFERENT fields -> merge (no conflict).
  eq("different fields merge", resolveWrite({ baseRev: 4, currentRev: 5, lastWriter: them, sessionId: me, fields: ["department"] }).action, "merge");

  // SAME field, different session -> conflict with the overlapping field named.
  const c = resolveWrite({ baseRev: 4, currentRev: 5, lastWriter: them, sessionId: me, fields: ["owner"] });
  eq("same field conflicts", c.action, "conflict");
  eq("conflict names the field", c.action === "conflict" ? c.fields : [], ["owner"]);

  // A stale write after an offline gap, but from MY session -> rebase silently.
  eq("offline gap, same session rebases", resolveWrite({ baseRev: 1, currentRev: 9, lastWriter: { sessionId: me, by: "R. Iyer", at: "t", fields: ["owner"] }, sessionId: me, fields: ["owner"] }).action, "rebase");

  // No recorded writer + older base -> rebase (can't be someone else).
  eq("no last writer rebases", resolveWrite({ baseRev: 1, currentRev: 2, lastWriter: null, sessionId: me, fields: ["owner"] }).action, "rebase");

  console.log(`\nProcessing Activities versions: ${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
})();
