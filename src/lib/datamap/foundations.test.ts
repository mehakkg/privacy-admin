/**
 * Unit tests for the Data map shared foundations (M1). Run via the npm test
 * harness (tsx). No test-runner dependency.
 */
import { plural, agree, formatDate, formatDateTime, daysBetween, readinessSegments, STATUS_TOKENS } from "./foundations";

let pass = 0, fail = 0;
function check(name: string, cond: boolean) { if (cond) pass++; else { fail++; console.error("FAIL: " + name); } }
function eq<T>(name: string, got: T, want: T) { check(`${name} — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`, JSON.stringify(got) === JSON.stringify(want)); }

// --- plural / agree ---------------------------------------------------------
eq("plural 1 field", plural(1, "field"), "1 field");
eq("plural 2 fields", plural(2, "field"), "2 fields");
eq("plural 0 fields", plural(0, "field"), "0 fields");
eq("plural irregular", plural(2, "entry", "entries"), "2 entries");
eq("plural 1 irregular", plural(1, "entry", "entries"), "1 entry");
eq("agree singular", agree(1, "needs", "need"), "needs");
eq("agree plural", agree(2, "needs", "need"), "need");
eq("agree zero", agree(0, "needs", "need"), "need");

// --- date -------------------------------------------------------------------
eq("formatDate", formatDate(new Date("2026-10-19T12:49:00")), "19 Oct 2026");
eq("formatDate string", formatDate("2026-08-12T00:00:00"), "12 Aug 2026");
eq("formatDate null", formatDate(null), "—");
eq("formatDate invalid", formatDate("not a date"), "—");
eq("formatDateTime", formatDateTime(new Date("2026-10-19T12:49:00")), "19 Oct 2026, 12:49");
eq("formatDateTime pads", formatDateTime(new Date("2026-10-19T09:05:00")), "19 Oct 2026, 09:05");
eq("daysBetween 11", daysBetween("2026-10-08T12:00:00", "2026-10-19T12:00:00"), 11);
eq("daysBetween 0", daysBetween("2026-10-19T09:00:00", "2026-10-19T12:00:00"), 0);

// --- readinessSegments ------------------------------------------------------
const segs = readinessSegments([
  { token: "attention", label: "Needs classification", count: 3 },
  { token: "attention", label: "Needs a purpose", count: 4 },
  { token: "stale", label: "Out of date", count: 0 },
  { token: "ready", label: "Ready", count: 2 },
]);
eq("segments drop zeros", segs.map((s) => s.label), ["Needs classification", "Needs a purpose", "Ready"]);
eq("segments keep order + token", segs.map((s) => s.token), ["attention", "attention", "ready"]);
eq("segment pct sums to 100", Math.round(segs.reduce((n, s) => n + s.pct, 0)), 100);
eq("segment pct of 3 of 9", Math.round(readinessSegments([{ token: "ready", label: "Ready", count: 3 }, { token: "attention", label: "Gap", count: 6 }])[0].pct), 33);
eq("empty input → no segments", readinessSegments([{ token: "ready", label: "Ready", count: 0 }]).length, 0);

// --- tokens -----------------------------------------------------------------
eq("four tokens only", Object.keys(STATUS_TOKENS).sort(), ["attention", "new", "ready", "stale"]);
check("no token is red", Object.values(STATUS_TOKENS).every((t) => !/--red/.test(t.varName)));

console.log(`\nData map foundations: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
