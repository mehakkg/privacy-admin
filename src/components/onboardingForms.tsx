"use client";

import { useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  addProcessorAction,
  approveFieldAction,
  approveHighConfidenceAction,
  completeStepAction,
  confirmGateAction,
  finishOnboardingAction,
  overrideFieldAction,
  runScanAction,
  saveRoutingAction,
  skipStepAction,
  testSourceAction,
} from "@/app/actions/onboarding";
import type { ActionResult } from "@/app/actions/requests";
import { ActionError } from "@/components/actions";
import {
  DATA_CATEGORIES,
  NOTIFY_CHANNEL_LABEL,
  ROLE_LABEL,
  SOURCE_KIND_LABEL,
  type ActorRole,
  type NotifyChannel,
  type SourceKind,
} from "@/lib/domain";

function useAction() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);

  const run = (operation: () => Promise<ActionResult>, then?: () => void) => {
    start(async () => {
      const r = await operation();
      setResult(r);
      if (r.ok) {
        then?.();
        router.refresh();
      }
    });
  };

  return { pending, result, run, router };
}

function Btn({
  onClick,
  pending,
  disabled,
  variant = "",
  title,
  children,
}: {
  onClick: () => void;
  pending: boolean;
  disabled?: boolean;
  variant?: string;
  title?: string;
  children: ReactNode;
}) {
  return (
    <button
      className={`btn ${variant}`}
      onClick={onClick}
      disabled={pending || disabled}
      title={title}
    >
      {pending ? "Working…" : children}
    </button>
  );
}

/** Shared footer. Screen 1 never renders a skip control — it has none to render. */
export function StepFooter({
  step,
  nextHref,
  skippable,
  primaryLabel = "Continue",
  onPrimary,
  primaryDisabled,
  primaryTitle,
  skipLabel = "Skip for now",
}: {
  step: number;
  nextHref: string;
  skippable: boolean;
  primaryLabel?: string;
  onPrimary?: () => Promise<ActionResult>;
  primaryDisabled?: boolean;
  primaryTitle?: string;
  skipLabel?: string;
}) {
  const { pending, result, run, router } = useAction();

  return (
    <div className="wiz-foot">
      <Btn
        pending={pending}
        variant="primary"
        disabled={primaryDisabled}
        title={primaryTitle}
        onClick={() =>
          run(
            onPrimary ?? (() => completeStepAction(step)),
            () => router.push(nextHref),
          )
        }
      >
        {primaryLabel}
      </Btn>

      {skippable && (
        <Btn
          pending={pending}
          variant="ghost"
          onClick={() => run(() => skipStepAction(step), () => router.push(nextHref))}
        >
          {skipLabel}
        </Btn>
      )}

      <span className="spacer" />
      <span className="cell-sub">
        Progress is saved as you go — you can close this and pick up here.
      </span>
      <ActionError result={result} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Screen 1
// ---------------------------------------------------------------------------

export function GateForm({
  contacts,
  categoryCount,
  noDpoAssigned,
  noRetentionCategories,
  governanceUnavailable,
  multiEntity,
  initialContactId,
  initialBackupId,
}: {
  contacts: {
    id: string;
    name: string;
    role: string;
    entity: string | null;
    hasNotificationChannel: boolean;
    notificationsMuted: boolean;
  }[];
  categoryCount: number;
  noDpoAssigned: boolean;
  noRetentionCategories: boolean;
  governanceUnavailable: boolean;
  multiEntity: boolean;
  initialContactId: string | null;
  initialBackupId: string | null;
}) {
  const { pending, result, run, router } = useAction();

  const dpos = contacts.filter((c) => c.role === "dpo");
  const [contactId, setContactId] = useState(
    initialContactId ?? dpos.find((d) => !d.entity)?.id ?? dpos[0]?.id ?? "",
  );
  const [backupId, setBackupId] = useState(initialBackupId ?? "");
  const [entity, setEntity] = useState("");

  const backup = contacts.find((c) => c.id === backupId);
  const backupUnreachable = Boolean(backup && !backup.hasNotificationChannel);

  // The gate: no escalation contact, no way forward. A backup that cannot be
  // notified also blocks, because routing to it would be routing to nowhere.
  const blocked = !contactId || backupUnreachable;

  return (
    <div>
      <div className="grid-2">
        <div>
          <div className="section-label">Escalation contact</div>
          <p className="cell-sub" style={{ margin: "0 0 10px" }}>
            This is who retention conflicts and policy exceptions route to.
            Admin cannot rule on them, so they have to reach someone who can.
          </p>

          {noDpoAssigned ? (
            <div className="notice warn" style={{ marginBottom: 12 }}>
              <div className="notice-title">No DPO assigned yet</div>
              <div>
                Escalations will queue until one is set. You can continue — the
                queue is not lost — but nothing will be ruled on until a DPO
                exists, and this warning stays on your dashboard until then.
              </div>
            </div>
          ) : null}

          <select
            className="input"
            value={contactId}
            onChange={(e) => setContactId(e.target.value)}
          >
            <option value="">— Select a contact —</option>
            {contacts
              .filter((c) => c.role === "dpo")
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} — {ROLE_LABEL[c.role as ActorRole]}
                  {c.entity ? ` (${c.entity})` : " (primary entity)"}
                </option>
              ))}
          </select>

          {multiEntity && dpos.length > 1 && (
            <div className="notice info" style={{ marginTop: 10 }}>
              <div className="notice-title">
                More than one DPO — routing is scoped per entity
              </div>
              <div>
                Defaulting to the primary entity&apos;s DPO. Per-entity routing
                can be refined later in Escalations without redoing this step.
              </div>
              <input
                className="input"
                style={{ marginTop: 8 }}
                placeholder="Optional: entity this routing applies to"
                value={entity}
                onChange={(e) => setEntity(e.target.value)}
              />
            </div>
          )}

          <div className="section-label" style={{ marginTop: 16 }}>
            Backup contact <span className="cell-sub">(optional)</span>
          </div>
          <select
            className="input"
            value={backupId}
            onChange={(e) => setBackupId(e.target.value)}
          >
            <option value="">— None —</option>
            {contacts
              .filter((c) => c.id !== contactId)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} — {ROLE_LABEL[c.role as ActorRole]}
                  {c.hasNotificationChannel ? "" : " (no notification channel)"}
                </option>
              ))}
          </select>

          {backupUnreachable && (
            <div className="notice danger" style={{ marginTop: 10 }}>
              <div className="notice-title">
                {backup?.name} has no notification channel
              </div>
              <div>
                Escalations routed to them would go nowhere. Pick someone else,
                or leave the backup empty — an empty backup is honest, a
                silently-unreachable one is not.
              </div>
            </div>
          )}

          {backup?.notificationsMuted && !backupUnreachable && (
            <p className="cell-sub" style={{ marginTop: 8 }}>
              Note: {backup.name} has muted their own notifications. That is
              their setting to make, so it is respected — they will still see
              escalations in the portal.
            </p>
          )}
        </div>

        <div>
          <div className="section-label">Statutory retention categories</div>
          <p className="cell-sub" style={{ margin: "0 0 10px" }}>
            These decide when a deletion request must withhold data rather than
            erase it. They are the DPO&apos;s to define — this is a read of the
            approved list, not an editor.
          </p>

          {noRetentionCategories && (
            <div className="notice danger">
              <div className="notice-title">No retention categories configured</div>
              <div>
                Deletion requests will proceed without a retention check until
                the DPO adds categories. An empty list is not the same as
                &ldquo;nothing to withhold&rdquo; — it means nothing is being
                checked, so a statutory obligation could be erased through.
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="wiz-foot">
        <Btn
          pending={pending}
          variant="primary"
          disabled={blocked}
          title={
            blocked
              ? backupUnreachable
                ? "Resolve the backup contact first."
                : "Set an escalation contact to continue."
              : undefined
          }
          onClick={() =>
            run(
              () =>
                confirmGateAction({
                  escalationContactActorId: contactId || null,
                  backupContactActorId: backupId || null,
                  backupHasChannel: backup ? backup.hasNotificationChannel : true,
                  backupName: backup?.name ?? null,
                  scopedEntityId: entity.trim() || null,
                  noDpoAssigned,
                  noRetentionCategories,
                  governanceUnavailable,
                  categoryCount,
                }),
              () => router.push("/onboarding/sources"),
            )
          }
        >
          Confirm and continue
        </Btn>
        <span className="spacer" />
        {/* Deliberately no skip control. This step has none. */}
        <span className="cell-sub">
          This step cannot be skipped — it is the one thing that has to be set.
        </span>
        <ActionError result={result} />
      </div>
    </div>
  );
}

/** Shown when the Governance Portal cannot be reached at all. */
export function GovernanceRetryPanel({ retryHref }: { retryHref: string }) {
  const { pending, result, run, router } = useAction();
  const [acknowledged, setAcknowledged] = useState(false);

  return (
    <div>
      <div className="notice danger">
        <div className="notice-title">Unable to load governance configuration</div>
        <div>
          The Governance Portal did not respond, so the DPO roster and the
          statutory retention categories could not be read. Nothing has been
          assumed in their place — an empty list and an unreadable list are
          different facts, and the system will not quietly treat one as the
          other.
        </div>
      </div>

      <div className="wiz-foot">
        <Btn pending={pending} variant="primary" onClick={() => router.push(retryHref)}>
          Retry
        </Btn>
        <span className="spacer" />
      </div>

      <div className="card" style={{ marginTop: 18 }}>
        <div className="card-head">
          <h2 className="card-title">If retrying keeps failing</h2>
        </div>
        <div className="card-body">
          <p style={{ marginTop: 0 }}>
            You can continue without governance data, but it is a risk
            acknowledgment rather than a dismissal: escalation routing will be
            unset and retention checks will not run until governance loads.
          </p>
          <label className="row" style={{ gap: 8, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)}
            />
            <span>
              I understand this will be logged against my name, and that
              deletion requests may run without a retention check until
              governance configuration loads.
            </span>
          </label>
          <div className="row" style={{ marginTop: 12 }}>
            <Btn
              pending={pending}
              variant="danger"
              disabled={!acknowledged}
              onClick={() =>
                run(
                  () =>
                    confirmGateAction({
                      escalationContactActorId: null,
                      backupContactActorId: null,
                      backupHasChannel: true,
                      backupName: null,
                      scopedEntityId: null,
                      noDpoAssigned: true,
                      noRetentionCategories: true,
                      governanceUnavailable: true,
                      categoryCount: 0,
                    }),
                  () => router.push("/onboarding/sources"),
                )
              }
            >
              Continue without governance data — this will be logged
            </Btn>
          </div>
          <ActionError result={result} />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Screen 2
// ---------------------------------------------------------------------------

const KIND_HELP: Record<SourceKind, { field: string; help: string }> = {
  database: {
    field: "Host and port",
    help: "Where the database listens, e.g. db-prod.internal:5432. Ask the system owner if unsure.",
  },
  cloud_storage: {
    field: "Bucket or container",
    help: "The bucket or container name, plus the region if it has one.",
  },
  saas: {
    field: "Account or tenant URL",
    help: "The web address you sign in to, e.g. acme.salesforce.com.",
  },
  file_share: {
    field: "Share path",
    help: "The network path, e.g. \\\\fileserver\\finance. Large shares take longer to scan.",
  },
  other: {
    field: "Connection string",
    help: "Anything the system needs to be reached. Sources added this way usually need manual verification later.",
  },
};

export function SourceForm() {
  const { pending, result, run } = useAction();
  const [kind, setKind] = useState<SourceKind | null>(null);
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");

  return (
    <div>
      <div className="tile-grid" style={{ marginBottom: 16 }}>
        {(Object.keys(SOURCE_KIND_LABEL) as SourceKind[]).map((k) => (
          <button
            key={k}
            className={`tile${kind === k ? " on" : ""}`}
            onClick={() => setKind(k)}
            style={{ textAlign: "left" }}
          >
            <div className="tile-title">{SOURCE_KIND_LABEL[k]}</div>
            <div className="tile-sub">{KIND_HELP[k].help}</div>
          </button>
        ))}
      </div>

      {kind && (
        <div className="card">
          <div className="card-head">
            <h2 className="card-title">Connect a {SOURCE_KIND_LABEL[kind]}</h2>
          </div>
          <div className="card-body">
            {kind === "other" && (
              <div className="notice warn" style={{ marginBottom: 12 }}>
                <div className="notice-title">
                  Custom sources usually need manual verification
                </div>
                <div>
                  We cannot confirm deletion automatically on a source we do not
                  have a connector for. Requests touching it will route to the
                  manual verification checklist instead of reporting themselves
                  done.
                </div>
              </div>
            )}

            <div className="section-label">Name</div>
            <input
              className="input"
              placeholder="What you call this system internally"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />

            <div className="section-label" style={{ marginTop: 12 }}>
              {KIND_HELP[kind].field}
            </div>
            <input
              className="input"
              placeholder={KIND_HELP[kind].field}
              value={target}
              onChange={(e) => setTarget(e.target.value)}
            />
            <p className="cell-sub" style={{ margin: "4px 0 0" }}>
              {KIND_HELP[kind].help}
            </p>

            <div className="row" style={{ marginTop: 14 }}>
              <Btn
                pending={pending}
                variant="primary"
                disabled={!name.trim() || !target.trim()}
                onClick={() =>
                  run(() => testSourceAction(name, kind, target), () => {
                    setName("");
                    setTarget("");
                  })
                }
              >
                Test connection
              </Btn>
              <span className="cell-sub">
                Nothing is scanned yet — this only checks we can reach it.
              </span>
            </div>
            <ActionError result={result} />
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Screen 3
// ---------------------------------------------------------------------------

export function ScanRunner({
  sources,
}: {
  sources: {
    id: string;
    name: string;
    approved: boolean;
    connectionState: string;
    estimatedDurationMinutes: number | null;
  }[];
}) {
  const { pending, result, run } = useAction();
  const approved = sources.filter((s) => s.approved);
  const [selected, setSelected] = useState<string[]>(approved.map((s) => s.id));
  const [background, setBackground] = useState(false);

  const totalMinutes = sources
    .filter((s) => selected.includes(s.id))
    .reduce((sum, s) => sum + (s.estimatedDurationMinutes ?? 5), 0);

  const slow = totalMinutes > 20;

  return (
    <div>
      {slow && (
        <div className="notice warn" style={{ marginBottom: 12 }}>
          <div className="notice-title">
            Estimated scan time: about {totalMinutes} minutes
          </div>
          <div>
            Long enough that waiting on this screen is a poor use of your time.
            Running in the background is the same scan — you get notified in-app
            when it finishes.
          </div>
          <label className="row" style={{ gap: 8, marginTop: 8, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={background}
              onChange={(e) => setBackground(e.target.checked)}
            />
            <span>Run in the background and notify me when done</span>
          </label>
        </div>
      )}

      <div className="stack" style={{ gap: 6 }}>
        {sources.map((s) => (
          <label
            key={s.id}
            className="row"
            style={{
              gap: 9,
              padding: "8px 10px",
              border: "1px solid var(--border-soft)",
              borderRadius: "var(--radius)",
              opacity: s.approved ? 1 : 0.55,
              cursor: s.approved ? "pointer" : "not-allowed",
            }}
          >
            <input
              type="checkbox"
              disabled={!s.approved}
              checked={selected.includes(s.id)}
              onChange={() =>
                setSelected((prev) =>
                  prev.includes(s.id)
                    ? prev.filter((x) => x !== s.id)
                    : [...prev, s.id],
                )
              }
            />
            <span style={{ fontWeight: 500 }}>{s.name}</span>
            {!s.approved && (
              <>
                <span className="pill yellow">
                  <span className="dot" />
                  Awaiting DPO scope approval
                </span>
                <Link href="/escalations" className="cell-sub">
                  Request approval →
                </Link>
              </>
            )}
            {s.approved && s.connectionState !== "connected" && (
              <span className="pill red">
                <span className="dot" />
                {s.connectionState.replace(/_/g, " ")}
              </span>
            )}
            <span className="spacer" style={{ marginLeft: "auto" }} />
            <span className="cell-sub">~{s.estimatedDurationMinutes ?? 5} min</span>
          </label>
        ))}
      </div>

      <div className="row" style={{ marginTop: 14 }}>
        <Btn
          pending={pending}
          variant="primary"
          disabled={selected.length === 0}
          onClick={() => run(() => runScanAction(selected))}
        >
          {background ? "Start background scan" : `Run scan on ${selected.length} source(s)`}
        </Btn>
        {approved.length === 0 && (
          <span className="cell-sub">
            No source has DPO scope approval yet, so there is nothing to scan.
          </span>
        )}
      </div>
      <ActionError result={result} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Screen 4
// ---------------------------------------------------------------------------

export function BulkApproveButton({ count }: { count: number }) {
  const { pending, result, run } = useAction();
  return (
    <span>
      <Btn
        pending={pending}
        variant="primary sm"
        onClick={() => run(() => approveHighConfidenceAction())}
      >
        Approve all {count} high-confidence
      </Btn>
      <ActionError result={result} />
    </span>
  );
}

export function FieldReviewRow({
  fieldId,
  detectedType,
  highConfidence,
}: {
  fieldId: string;
  detectedType: string;
  highConfidence: boolean;
}) {
  const { pending, result, run } = useAction();
  const [editing, setEditing] = useState(false);
  const [newType, setNewType] = useState(detectedType);
  // Kept in component state so a failed save never loses the typed reason.
  const [reason, setReason] = useState("");

  if (!editing) {
    return (
      <div className="row" style={{ gap: 6 }}>
        <Btn pending={pending} variant="sm" onClick={() => run(() => approveFieldAction(fieldId))}>
          Approve as detected
        </Btn>
        <button className="btn sm ghost" onClick={() => setEditing(true)}>
          Change
        </button>
        <ActionError result={result} />
      </div>
    );
  }

  return (
    <div style={{ minWidth: 280 }}>
      <select
        className="input"
        value={newType}
        onChange={(e) => setNewType(e.target.value)}
      >
        {DATA_CATEGORIES.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
        <option value="not_personal_data">not personal data</option>
      </select>
      <textarea
        className="input"
        style={{ marginTop: 6 }}
        rows={2}
        placeholder="Why is the detected type wrong? (required)"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />
      {highConfidence && (
        <p className="cell-sub" style={{ margin: "4px 0 0" }}>
          The detector was confident about this one. Your correction is recorded
          as scoring feedback for this pattern, not just for this field.
        </p>
      )}
      <div className="row" style={{ marginTop: 8, gap: 6 }}>
        <Btn
          pending={pending}
          variant="primary sm"
          disabled={!reason.trim()}
          onClick={() =>
            run(() => overrideFieldAction(fieldId, newType, reason), () =>
              setEditing(false),
            )
          }
        >
          Save correction
        </Btn>
        <button className="btn sm ghost" onClick={() => setEditing(false)}>
          Cancel
        </button>
      </div>
      {/* The typed reason survives a failed save — it stays in state. */}
      <ActionError result={result} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Screen 5
// ---------------------------------------------------------------------------

export function ProcessorForm() {
  const { pending, result, run } = useAction();
  const [name, setName] = useState("");
  const [dpaId, setDpaId] = useState("");
  const [channel, setChannel] = useState("email");
  const [status, setStatus] = useState<"draft" | "active">("active");
  const [subs, setSubs] = useState("");

  const anomalous = dpaId.trim() !== "" && !/^DPA-\d{4}-\d{3,}$/.test(dpaId.trim());

  return (
    <div>
      <div className="section-label">Processor name</div>
      <input
        className="input"
        placeholder="e.g. Sendwave (email delivery)"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />

      <div className="section-label" style={{ marginTop: 12 }}>
        DPA reference
      </div>
      <input
        className="input"
        placeholder="DPA-2026-001"
        value={dpaId}
        onChange={(e) => setDpaId(e.target.value)}
      />
      {anomalous && (
        <p className="cell-sub" style={{ margin: "4px 0 0", color: "var(--yellow)" }}>
          This does not match the usual DPA-YYYY-NNN pattern. Saved as entered —
          there is no registry to check it against, so this is a note, not a
          rejection.
        </p>
      )}

      <div className="section-label" style={{ marginTop: 12 }}>
        Contact channel
      </div>
      <select className="input" value={channel} onChange={(e) => setChannel(e.target.value)}>
        <option value="email">Email</option>
        <option value="portal">Vendor portal</option>
        <option value="sftp">SFTP</option>
      </select>

      <div className="section-label" style={{ marginTop: 12 }}>
        DPA status
      </div>
      <select
        className="input"
        value={status}
        onChange={(e) => setStatus(e.target.value as "draft" | "active")}
      >
        <option value="active">Executed — instructions may be sent</option>
        <option value="draft">Draft — DPA still being finalised</option>
      </select>
      {status === "draft" && (
        <div className="notice warn" style={{ marginTop: 8 }}>
          <div className="notice-title">
            Saved as draft — instructions will be blocked, not warned about
          </div>
          <div>
            DPDP s.8(2) allows a Processor to process on our behalf only under a
            valid contract, so no deletion or access instruction can be
            dispatched to this processor until the DPA is executed. Registering
            it now is fine; instructing it is not.
          </div>
        </div>
      )}

      <div className="section-label" style={{ marginTop: 12 }}>
        Sub-processors <span className="cell-sub">(optional at this stage)</span>
      </div>
      <input
        className="input"
        placeholder="Comma separated, if disclosed"
        value={subs}
        onChange={(e) => setSubs(e.target.value)}
      />

      <div className="row" style={{ marginTop: 14 }}>
        <Btn
          pending={pending}
          variant="primary"
          disabled={!name.trim() || !dpaId.trim()}
          onClick={() =>
            run(
              () =>
                addProcessorAction(
                  name,
                  dpaId,
                  channel,
                  status,
                  subs.split(",").map((s) => s.trim()).filter(Boolean),
                ),
              () => {
                setName("");
                setDpaId("");
                setSubs("");
              },
            )
          }
        >
          Add processor
        </Btn>
      </div>
      <ActionError result={result} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Screen 6
// ---------------------------------------------------------------------------

export function RoutingEditor({
  events,
  roles,
}: {
  events: {
    eventType: string;
    label: string;
    recipientRole: string;
    channel: string;
    rationale: string;
    isCustom: boolean;
    recipientMuted: boolean;
  }[];
  roles: string[];
}) {
  const { pending, result, run, router } = useAction();
  const [rows, setRows] = useState(events);

  const update = (eventType: string, patch: Partial<(typeof events)[number]>) =>
    setRows((prev) =>
      prev.map((r) => (r.eventType === eventType ? { ...r, ...patch } : r)),
    );

  const unrouted = rows.filter((r) => r.isCustom && !r.recipientRole);

  return (
    <div>
      <div className="table-wrap">
        <table className="dtable">
          <thead>
            <tr>
              <th>Event</th>
              <th>Recipient</th>
              <th>Channel</th>
              <th>Why this default</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.eventType}>
                <td>
                  <div className="cell-stack">
                    <span className="cell-primary">{r.label}</span>
                    <span className="cell-sub mono">{r.eventType}</span>
                    {r.isCustom && <span className="pill purple">Custom event</span>}
                  </div>
                </td>
                <td>
                  <select
                    className="input"
                    value={r.recipientRole}
                    onChange={(e) => update(r.eventType, { recipientRole: e.target.value })}
                  >
                    <option value="">— Assign —</option>
                    {roles.map((role) => (
                      <option key={role} value={role}>
                        {ROLE_LABEL[role as ActorRole]}
                      </option>
                    ))}
                  </select>
                  {r.isCustom && !r.recipientRole && (
                    <span className="cell-sub" style={{ color: "var(--red)" }}>
                      Required — no default exists for a custom event
                    </span>
                  )}
                  {r.recipientMuted && r.recipientRole && (
                    <span className="cell-sub" style={{ color: "var(--yellow)" }}>
                      This recipient has muted notifications on their own
                      account. Their setting, so it stands — they will still see
                      it in the portal.
                    </span>
                  )}
                </td>
                <td>
                  <select
                    className="input"
                    value={r.channel}
                    onChange={(e) => update(r.eventType, { channel: e.target.value })}
                  >
                    {(Object.keys(NOTIFY_CHANNEL_LABEL) as NotifyChannel[]).map((c) => (
                      <option key={c} value={c}>
                        {NOTIFY_CHANNEL_LABEL[c]}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="cell-sub" style={{ maxWidth: 260 }}>
                  {r.rationale}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="wiz-foot">
        <Btn
          pending={pending}
          variant="primary"
          disabled={unrouted.length > 0}
          title={
            unrouted.length > 0
              ? "Assign a recipient for every custom event first."
              : undefined
          }
          onClick={() =>
            run(
              async () => {
                const saved = await saveRoutingAction(
                  rows.map((r) => ({
                    eventType: r.eventType,
                    recipientRole: r.recipientRole,
                    channel: r.channel,
                  })),
                );
                if (!saved.ok) return saved;
                return completeStepAction(6);
              },
              () => router.push("/onboarding/summary"),
            )
          }
        >
          Save routing and continue
        </Btn>
        <Btn
          pending={pending}
          variant="ghost"
          onClick={() => run(() => skipStepAction(6), () => router.push("/onboarding/summary"))}
        >
          Skip — keep the defaults
        </Btn>
        <span className="spacer" />
        <ActionError result={result} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Screen 7
// ---------------------------------------------------------------------------

export function FinishButton() {
  const { pending, result, run, router } = useAction();
  return (
    <div>
      <Btn
        pending={pending}
        variant="primary"
        onClick={() => run(() => finishOnboardingAction(), () => router.push("/requests"))}
      >
        Go to dashboard
      </Btn>
      <ActionError result={result} />
    </div>
  );
}
