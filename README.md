# Privacy Admin — DPDP compliance platform

The **Admin module** of a DPDP-compliant privacy and data protection platform: the
technical-execution layer that carries out what the DPO and CISO have already
approved. Admin executes deletion requests, dispatches processor instructions and
verifies completion across systems. It does not define purposes, approve notice
content, set cookie policy or author protection rules.

Grounded in India's **Digital Personal Data Protection Act, 2023** and the
**DPDP Rules, 2025**.

**Built so far:**

- **Scenario 1 — Rights Fulfillment Execution & Cross-System Verification** — the
  request anchor entity as **6 tabs** (Overview / Scope & Retention / Execution /
  Processor Instructions / Evidence / Audit Trail), with sub-obligations tracked
  individually under the parent reference
- **Scenario 2 — Access Lifecycle & Identity Hygiene** (7 screens)
- **Scenario 3 — Escalations** — the shared Escalation object, with an
  Open / Ruled / Closed queue and a three-state status tracker
  (pending ruling → ruled → action executed)
- **First-run onboarding wizard** (7 screens) — a reordered linear wizard with one
  mandatory, non-skippable first step

Remaining scenarios are not built; their models are declared so migrations stay
stable.

---

## Run it

```bash
npm install
```

```bash
npx prisma migrate dev
```

```bash
npm run db:seed
```

```bash
npm run dev
```

Then open <http://localhost:3000>. Other commands:

| Command | Purpose |
|---|---|
| `npm run build` | Typecheck + production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run db:reset` | Drop, re-migrate and reseed |
| `npx tsx scripts/verify.ts` | Exercise the seven acceptance criteria (Scenario 1) against the real engines |
| `npx tsx scripts/verify-access.ts` | Same, for Scenario 2's access lifecycle |
| `npx tsx scripts/verify-onboarding.ts` | Same, for the onboarding wizard's gate, skip and DPA rules |

Both verify scripts leave the database dirty by design — they perform real
mutations. Run `npm run db:seed` afterwards, and run them one at a time from a
freshly seeded database.

---

## The seven non-negotiable behaviours

These came out of a heuristic audit of a previous version of this product and are
treated as acceptance criteria. Each is enforced in the data layer, not in UI
copy — the corresponding check in `scripts/verify.ts` is named in the last column.

| # | Behaviour | Where it is enforced | Verified by |
|---|---|---|---|
| 1 | Completion is three-state, never binary | `lib/engines/completion.ts` derives state on every read. **No `complete`/`done` boolean exists in the schema.** `verified` requires every system *and* every processor confirmed *and* coverage complete | "Request with a failure and a confirmed system reads 'partial'" |
| 2 | Audit entries are automatic and immutable | `lib/engines/audit.ts` writes the entry in the same transaction as the mutation via `audited()`. Entries are sha256 hash-chained; `lib/db.ts` refuses update/delete outright. `targetId` is a plain string, not an FK, so no cascade can reach an entry | "Tampering via direct SQL is detected by the chain", "Audit entry survives deletion of the Data Principal it describes" |
| 3 | Cross-persona notification is automatic | `lib/engines/notification.ts` fans out on state change. **There is no "notify" control anywhere in the UI** and no screen calls the engine | "A successful execution notifies the Grievance Officer with no notify step" |
| 4 | Retention exceptions surface before deletion is reachable | `lib/guards/retentionGate.ts` throws in front of every execution mutation. The locked stepper mirrors it; the server enforces it regardless of route. Exceptions carry **field paths**, so deletion is partial by default | "dispatchSystemExecution on the KYC-conflict request is refused" |
| 5 | Admin cannot resolve legal conflicts unilaterally | `lib/guards/escalationGate.ts` — `overridden`/`upheld` are reachable only through a DPO ruling, and `assertMayRule` refuses any non-DPO actor. The UI offers "Request override from DPO", never "Override" | "Admin recording a ruling on their own escalation is refused" |
| 6 | Governance objects are read-only to Admin | No create/update/delete function for the four governance models exists anywhere in `src/` (verifiable by grep), and `lib/db.ts` refuses writes to them. `/governance` renders them under an "Approved policy — implementing" banner | "Updating a PurposeTag is refused" |
| 7 | System-specific error detail is visible to Admin | `failureCode`, `failureDetail` and `failureRawResponse` are stored in full and rendered on the Failure Investigation workspace — including the raw response body | "The failed record carries code, detail and the raw response" |

Current status: **26 checks passing** (`verify.ts`), **21 passing**
(`verify-access.ts`), **29 passing** (`verify-onboarding.ts`).

## First-run onboarding

A **reordered linear wizard** with exactly one mandatory step. Of the six
structures considered, the two rejected ones — a free-order checklist and a fast
path that defers everything — share a single failure: both let escalation routing
and retention awareness go silently unconfigured, which is the failure mode the
underlying audit exists to prevent.

So Screen 1 has **no skip control at all**, and `skipStep(1)` throws
`StepNotSkippableError` on the server. Everything else is skippable, and every
skip is recorded with **what it costs** rather than just the fact of it.

| Step | Skippable | Notes |
|---|---|---|
| 1 — Escalation & retention | **No** | Gate. Refuses without an escalation contact, and refuses a backup with no notification channel. First use of the policy-lock pattern |
| 2 — Data sources | Yes | Five tiles incl. "Other / custom"; three-part connection diagnostics |
| 3 — Discovery scan | Yes | Unapproved sources disabled with "Awaiting DPO scope approval"; per-source results |
| 4 — Classification review | **No** | Never auto-advances, even with nothing flagged — the click has to exist in the trail |
| 5 — Integrations & processors | Yes | Two tabs, never merged; draft DPA is a hard block |
| 6 — Notification routing | Yes | Defaults with rationale; custom events must be assigned |
| 7 — Summary | **No** | Three honest headings, including one for "gate still outstanding" |

### Demonstrating the edge cases

Screen 1's branches are reachable from the URL so they can be shown rather than
described:

```
/onboarding/escalation?sim=gov_down       portal unreachable → retry, then logged risk acknowledgment
/onboarding/escalation?sim=no_dpo         no DPO assigned → escalations queue
/onboarding/escalation?sim=no_categories  empty category list → explicit risk callout
/onboarding/escalation?sim=multi_entity   two DPOs → entity-scoped routing
/onboarding/escalation?sim=bad_backup     backup with no channel → blocks continue
```

Screen 2's connection outcomes key off the host string: `badpass` → credentials
rejected, `unreach` → host unreachable, `noperm` → insufficient permissions,
`empty` → connected but nothing accessible.

### Decisions worth flagging

- **"Unreachable" and "empty" are different facts.** The governance client throws
  when the portal is down rather than returning an empty list, because
  substituting one for the other would let Screen 1 say "no retention categories
  configured" when the truth is "we could not find out".
- **A draft DPA hard-blocks dispatch.** DPDP s.8(2) requires a valid contract, and
  there is no version of "nearly signed" that makes the instruction lawful. The
  wizard lets a draft processor be *saved* precisely so the block has something to
  bite on, instead of the record living in someone's inbox until legal finishes.
- **DPA reference format is flagged, never blocked.** There is no registry to
  validate against, so rejecting on a pattern would reject valid references from
  any organisation numbering theirs differently.
- **Overriding a high-confidence detection is logged under its own action**
  (`classification_high_confidence_corrected`). A wrong confident call is evidence
  about the *pattern*, not just that row, so it should not be filed with routine
  overrides.
- **The dashboard strip is not dismissible.** A skipped compliance step that can
  be waved away is one nobody returns to; the visible deferral is what makes
  allowing the skip defensible at all.
- **Screen 7's third heading was a real bug found in verification.** The summary
  originally read "Minimum compliance setup complete" even when the mandatory gate
  was still pending. Fixed: the gate-outstanding case gets its own heading, and
  Finish is unavailable until step 1 is confirmed.

### How Scenario 2 applies the same criteria

Access lifecycle is not a separate discipline bolted alongside rights
fulfilment — it reuses the same guarantees, because it is the same shape of
problem.

| Criterion | Applied to access |
|---|---|
| 1 — three-state | `computeRevocationCompletion` mirrors `computeCompletion`. **`verified` requires every account revoked AND no live session anywhere.** Revoking a role does not end a session already running, so a revocation that removed the grant and left a refresh token reads **partial**, with the reason stated |
| 2 — automatic audit | Every grant, revocation, session termination, disposition and role edit goes through `audited()` |
| 3 — auto notification | A failed revocation raises a **critical** notification to the CISO and DPO. There is no notify step |
| 4 — surface before acting | Over-broad grants and orphaned accounts are surfaced on the panel where the action is taken, not in a later report |
| 5 — no unilateral resolution | `assertWithinBaseline` refuses widening a role past its CISO-approved baseline; the UI offers a baseline-change escalation instead. Narrowing is always allowed — the asymmetry is deliberate |
| 6 — governance read-only | The role **baseline** is CISO-owned and rendered under the same "Approved policy" banner. Admin edits the role within it |
| 7 — failure detail visible | The Account Investigation panel shows the revocation's error code, detail and raw response, and states plainly that nothing changed on the target system |

One design decision worth flagging: **a failed revocation writes no local
state**. Grants stay live, sessions stay live, the account stays active. Marking
them revoked because we tried would make the database claim something about the
target system that is not true — which is precisely how access comes to be
believed gone while it still works.

---

## Architecture

```
src/
  lib/
    dpdp/statute.ts      every statutory constant, with citation and source
    domain.ts            the vocabulary (unions standing in for SQLite enums)
    db.ts                Prisma client + immutability / read-only extension
    engines/
      audit.ts           automatic, hash-chained audit logging
      notification.ts    cross-persona fan-out
      sla.ts             deadline computation and severity banding
      completion.ts      three-state derivation + coverage assessment
      execution.ts       every Scenario 1 mutation
      access.ts          every Scenario 2 mutation + revocation completion
      onboarding.ts      wizard state, resume, and the non-skippable gate
    governance/
      portal.ts          stubbed Governance Portal client, with a failure mode
    guards/
      retentionGate.ts   blocks execution while an obligation is unreviewed
      escalationGate.ts  blocks unilateral override
      baselineGate.ts    blocks widening a role past its approved baseline
      processorGate.ts   blocks dispatch to a draft-DPA processor (s.8(2))
    connectors/
      simulated.ts       the ONLY module that fakes anything
  app/
    actions/             thin server-action adapters — no direct Prisma access
    requests/            the 11 Scenario 1 screens
    access/              the 7 Scenario 2 screens
    escalations/         the shared escalation queue + status tracker
    onboarding/          the 7 first-run wizard steps
    audit/ governance/ notifications/
```

**The layering rule:** screens call server actions, actions call engines, engines
call guards and Prisma. Nothing skips a layer. This is what stops the seven
criteria eroding as Scenarios 2–10 are added — the guarantees live in the engine
operation, so a future screen cannot forget them.

### The four shared engines

Built once and reused everywhere, per execution instruction #3. Roughly half the
features in the full spec route through them.

**Audit** — `audited(entry, mutation)` runs the mutation and appends the log entry
in one transaction. Each entry hashes its own content *including the previous
entry's hash*, so altering or removing any historical entry breaks every hash
after it. `verifyChain()` walks the chain and reports the first break; the audit
viewer and the evidence pack both show its result.

**Notification** — a typed event bus. Engines emit; the module decides which roles
were waiting and writes their rows, inside the caller's transaction.

**SLA** — computes deadlines from `statute.ts`, and keeps the 48-hour pre-erasure
notice separate from the fulfilment deadline: one is a precondition, the other a
target.

**Completion** — derives `pending | partial | verified`, with `failed` reported
alongside rather than folded in, plus a coverage assessment that withholds
`verified` when the location map itself cannot be trusted.

### Statutory constants

Every deadline resolves through `lib/dpdp/statute.ts`. Each constant carries a
`source` of `statute` or `org_policy`, and the UI renders that distinction — so a
countdown driven by internal policy is never displayed as though the Act required
it. The 30-day fulfilment period is org policy; the 90-day grievance ceiling is
statutory, and is treated as a hard backstop rather than a target.

---

## Deviations and assumptions

Per execution instruction #5.

### 1. SQLite instead of Postgres (dev)

The spec calls for Postgres. This machine has no `docker`, `psql` or hosted
database (checked), and provisioning one would have blocked scaffolding, so the
schema is authored Postgres-shaped and runs on SQLite.

**To switch:** change `datasource.provider` in `prisma/schema.prisma` to
`postgresql`, set `DATABASE_URL`, re-run `prisma migrate dev`. Two portability
accommodations, both isolated:

- **No array columns.** List fields are JSON strings in `...Json` columns, encoded
  and decoded only in `lib/codec/json.ts`. On Postgres they can become real
  `String[]`; one file changes.
- **No enums.** Enum columns are `String`, constrained by TS unions in
  `lib/domain.ts` and documented with `///` comments on each field.

`AuditLogEntry` uses `seq Int @id @default(autoincrement())` because SQLite only
permits autoincrement on the primary key. This is portable (Postgres `serial`) and
is arguably the better model anyway: for an append-only chained log the sequence
number *is* the identity.

### 2. In-process scheduler instead of BullMQ

BullMQ requires Redis, which is not available here. Time-driven work
(delayed backup execution, retention expiry) runs as an idempotent tick:
`runTick()` in `lib/engines/execution.ts`, exposed at `/api/cron/tick` and via a
button on the request queue. Drive it with Vercel Cron in a deployment. Moving to
BullMQ means calling `runTick` from a worker; nothing else changes.

SLA *threshold* notifications are not yet emitted by the tick (`slaNotified` is
always 0) — deadline severity is computed on read and shown in the queue, which is
sufficient for Scenario 1 but should become a push before Scenario 10's escalation
monitor.

### 3. Simulated connectors

There are no live integrations. `lib/connectors/simulated.ts` is the only module
that fabricates anything; behaviour is deterministic and driven by each system's
own configuration (healthy → verified, degraded → partial, down → failed, delayed
→ scheduled, no API → cannot dispatch). Replacing it with real HTTP clients is the
integration work, and nothing upstream changes.

### 4. Governance modules are seeded stubs

The DPO and CISO modules do not exist in this build. Purposes, notice versions,
cookie categories and protection rules come from the seed, which sets
`PRIVACY_ADMIN_SEED=1` — the one caller `lib/db.ts` lets write to those models.
Nothing in `src/` sets that variable.

### 5. PDF export is the browser's print dialogue

"Export to PDF/CSV" is implemented as: CSV a real server-generated download
(`/api/evidence/[id]/csv`), PDF via `window.print()` against a print stylesheet.
The evidence pack is already a rendered document, and a second rendering path is a
second thing that can disagree with the record. A PDF library can be added if a
specific layout is required.

### 6. No authentication

The acting role comes from a cookie and defaults to `admin`; the header carries a
role switcher so the guards can be *demonstrated* rather than taken on trust
(switch to DPO to record a ruling, back to Admin to watch the same mutation be
refused). Every guard already takes the role as an argument, so replacing
`lib/session.ts` with a real session lookup is the whole change.

### 7. Interpretation calls

- **Fulfilment period.** The Act fixes no single number of days for a rights
  request; the Data Fiduciary publishes its own period, bounded by the 90-day
  grievance ceiling. Encoded as 30 days of **organisational policy**, explicitly
  labelled as such. Do not read it as statutory.
- **Coverage freshness.** A location rediscovered more than 90 days ago is treated
  as unproven. This threshold is a product judgement, not a legal one.
- **Retention exception blocking.** Only `unreviewed` blocks execution.
  Acknowledging an obligation (withholding its fields) unblocks the rest of the
  record, on the reading that s.8(7) protects the covered data and not the
  request.
- **Escalation ruling authority.** Only the DPO may rule on a retention conflict.
  The CISO is not given this power; if protection-rule conflicts should be
  CISO-ruled, `RULING_ROLES` in `escalationGate.ts` is the one place to change.
- **Request status vs. completion.** `status` is workflow position; completion is
  derived separately and never written. They are deliberately not the same field.
- **Dormancy threshold (Scenario 2).** Configurable, defaulting to 90 days, and
  labelled in the UI as an organisational threshold. No DPDP provision fixes a
  dormancy period, and presenting one as though it did would be wrong.
- **Drift is only unapproved widening.** A role granting *less* than its baseline
  is not flagged. Flagging it would train people to ignore the flag.
- **Baseline changes are CISO-ruled, not DPO-ruled.** Role baselines are a
  security-safeguard decision (s.8(4)), so `requestBaselineChange` escalates to
  the CISO while retention conflicts go to the DPO.

### 8. Legal review outstanding

The constants in `lib/dpdp/statute.ts` encode a careful reading of the Act and the
2025 Rules, but **have not been reviewed by counsel**. They are centralised with
citations precisely so they can be checked and corrected in one place. Verify
against the gazetted text before relying on this for live compliance.

---

## Not built yet

Scenarios 3–10: Audit Trail Investigation (beyond the log viewer and escalation
builder Scenario 1 needed), Discovery & Integration, Purpose / Notice / Cookie
implementation, Flow Mapping & Protection Rules, Omnichannel Consent, Consent
Platform Configuration, Cookie Compliance Monitoring, and DPRR Queue Management.
Their models are declared in the schema so migrations stay stable; no screens or
seed depth exist for them.

The left navigation shows those areas greyed out rather than hiding them, so the
shape of the module is legible without implying the screens exist.
