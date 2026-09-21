"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { Pill } from "@/components/ui";
import { ActionError } from "@/components/actions";
import { deactivateAccountAction, reactivateAccountAction } from "@/app/actions/users";
import type { ActionResult } from "@/app/actions/requests";

export interface UserAccount {
  id: string;
  name: string;
  email: string;
  accountStatus: string; // active | deactivated | invited
  dateAdded: string;
}

const STATUS: Record<string, { label: string; tone: "green" | "gray" | "blue" }> = {
  active: { label: "Active", tone: "green" },
  deactivated: { label: "Deactivated", tone: "gray" },
  invited: { label: "Invited", tone: "blue" },
};

/**
 * SETTINGS → USERS — a lightweight account directory. Name, email, account status,
 * date added. No role / capability / permission data lives here: everything about
 * access routes to Identity & Access. Deactivation is account-level and calls the
 * existing cross-system revocation flow (never a role edit).
 */
export function UsersDirectory({ users }: { users: UserAccount[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  const run = (op: () => Promise<ActionResult>, after?: () => void) =>
    start(async () => { const r = await op(); setResult(r); if (r.ok) { after?.(); router.refresh(); } });

  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 12, gap: 8, flexWrap: "wrap" }}>
        <span className="cell-sub">{users.length} account{users.length === 1 ? "" : "s"}. Account status only — roles, capabilities and assignment live in Identity &amp; Access.</span>
        <Link href="/access/assignments" className="btn sm">Manage roles &amp; permissions <ArrowRight size={13} /></Link>
      </div>

      <div className="table-wrap">
        <table className="dtable">
          <thead>
            <tr><th>Name</th><th>Email</th><th>Account status</th><th>Date added</th><th /></tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td className="cell-primary">{u.name}</td>
                <td className="cell-sub mono">{u.email}</td>
                <td><Pill tone={STATUS[u.accountStatus]?.tone ?? "gray"}>{STATUS[u.accountStatus]?.label ?? u.accountStatus}</Pill></td>
                <td className="cell-sub">{u.dateAdded}</td>
                <td>
                  <span className="row" style={{ gap: 6, justifyContent: "flex-end" }}>
                    <Link href={`/access/assignments?user=${encodeURIComponent(u.name)}`} className="row-link" style={{ fontSize: 12.5 }}>Manage roles &amp; permissions →</Link>
                    {u.accountStatus === "deactivated" ? (
                      <button className="btn ghost xs" disabled={pending} onClick={() => run(() => reactivateAccountAction(u.id))}>Reactivate</button>
                    ) : confirming === u.id ? (
                      <span className="row" style={{ gap: 4 }}>
                        <button className="btn danger xs" disabled={pending} onClick={() => run(() => deactivateAccountAction(u.id), () => setConfirming(null))}>Confirm deactivate</button>
                        <button className="btn ghost xs" onClick={() => setConfirming(null)}>Cancel</button>
                      </span>
                    ) : (
                      <button className="btn btn-outline-danger xs" onClick={() => setConfirming(u.id)}>Deactivate</button>
                    )}
                  </span>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr><td colSpan={5}><div className="empty"><p style={{ margin: 0 }}>No user accounts yet.</p></div></td></tr>
            )}
          </tbody>
        </table>
      </div>
      {confirming && (
        <p className="cell-sub" style={{ marginTop: 8 }}>
          Deactivating an account triggers the cross-system revocation flow below — it does not edit roles directly. Live sessions and tokens are tracked separately until confirmed.
        </p>
      )}
      <ActionError result={result} />
    </div>
  );
}
