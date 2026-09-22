"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Send, ShieldAlert, ShieldCheck } from "lucide-react";
import { Notice, Pill } from "@/components/ui";
import { ActionError } from "@/components/actions";
import { createAssistedRequestAction } from "@/app/actions/omnichannel";
import { ID_METHOD_LABEL, CHANNEL_ORIGIN_LABEL, NOTIFICATION_CHANNEL_LABEL } from "@/lib/omnichannel";
import type { ActionResult } from "@/app/actions/requests";

export interface AvailableVerification { id: string; method: string; detail: string; verifiedAt: string }

const REQUEST_TYPES = ["access", "correction", "erasure", "nomination"];
const CHANNELS = ["assisted_branch", "assisted_phone"];
const NOTIFY = ["email", "sms", "call", "branch_handoff"];

export function AssistedIntakeForm({ verifications }: { verifications: AvailableVerification[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<(ActionResult & { reference?: string }) | null>(null);

  const [verificationId, setVerificationId] = useState("");
  const [type, setType] = useState("access");
  const [rawIdentifier, setRawIdentifier] = useState("");
  const [rawIdentifierKind, setRawIdentifierKind] = useState("email");
  const [channelOrigin, setChannelOrigin] = useState("assisted_branch");
  const [preferredNotificationChannel, setPreferredNotificationChannel] = useState("sms");

  const gated = verificationId === "";
  const canSubmit = !gated && rawIdentifier.trim().length > 0;

  const submit = () => start(async () => {
    const r = await createAssistedRequestAction({ verificationId, type, rawIdentifier, rawIdentifierKind, channelOrigin, preferredNotificationChannel });
    setResult(r);
    if (r.ok) { setRawIdentifier(""); setVerificationId(""); router.refresh(); }
  });

  return (
    <div className="card" style={{ maxWidth: 640 }}>
      <div className="card-head">New assisted request</div>
      <div className="card-body">
        <ActionError result={result} />
        {result?.ok && (
          <Notice tone="ok" title={`Request ${result.reference} created`}>
            It has entered the <Link href="/requests/sla" className="row-link">Central DPRR queue</Link> with its channel tagged, and an acknowledgment was dispatched on the preferred channel.
          </Notice>
        )}

        {/* Hard gate — no submit without a linked verification. */}
        {verifications.length === 0 ? (
          <Notice tone="warn" title="Identity verification required first">
            No completed identity verification is available. <Link href="/intake/identity-verification" className="row-link">Verify identity</Link> before raising an assisted request — this is a hard gate, not a reminder.
          </Notice>
        ) : (
          <label className="fld">
            <span>Linked identity verification <span className="cell-sub">(required)</span></span>
            <select className="input" value={verificationId} onChange={(e) => setVerificationId(e.target.value)}>
              <option value="">— select a completed verification —</option>
              {verifications.map((v) => <option key={v.id} value={v.id}>{ID_METHOD_LABEL[v.method]} · {v.detail}</option>)}
            </select>
          </label>
        )}

        <div className="row" style={{ gap: 6, margin: "6px 0 12px" }}>
          {gated
            ? <Pill tone="yellow" dot={false}><ShieldAlert size={11} style={{ verticalAlign: "-1px" }} /> Blocked — pending verification</Pill>
            : <Pill tone="green" dot={false}><ShieldCheck size={11} style={{ verticalAlign: "-1px" }} /> Verification linked — unblocked</Pill>}
        </div>

        <label className="fld"><span>Request type</span>
          <select className="input" value={type} onChange={(e) => setType(e.target.value)} disabled={gated}>
            {REQUEST_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <label className="fld"><span>Data principal identifier</span>
          <input className="input" value={rawIdentifier} onChange={(e) => setRawIdentifier(e.target.value)} placeholder="email / phone / customer ref" disabled={gated} />
        </label>
        <label className="fld"><span>Identifier kind</span>
          <select className="input" value={rawIdentifierKind} onChange={(e) => setRawIdentifierKind(e.target.value)} disabled={gated}>
            {["email", "phone", "pan", "customer_id", "other"].map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        </label>
        <label className="fld"><span>Channel origin</span>
          <select className="input" value={channelOrigin} onChange={(e) => setChannelOrigin(e.target.value)} disabled={gated}>
            {CHANNELS.map((c) => <option key={c} value={c}>{CHANNEL_ORIGIN_LABEL[c]}</option>)}
          </select>
        </label>
        <label className="fld"><span>Preferred notification channel</span>
          <select className="input" value={preferredNotificationChannel} onChange={(e) => setPreferredNotificationChannel(e.target.value)} disabled={gated}>
            {NOTIFY.map((c) => <option key={c} value={c}>{NOTIFICATION_CHANNEL_LABEL[c]}</option>)}
          </select>
        </label>

        <button className="btn primary" disabled={pending || !canSubmit} onClick={submit}>
          <Send size={14} /> {pending ? "Creating…" : "Create assisted request"}
        </button>
      </div>
    </div>
  );
}
