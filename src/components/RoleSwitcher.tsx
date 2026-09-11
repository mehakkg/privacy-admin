"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { switchRole } from "@/app/actions/session";
import { ROLE_LABEL, type ActorRole } from "@/lib/domain";

/**
 * Demo affordance, not a product feature.
 *
 * The guards take the acting role as an argument rather than assuming Admin, so
 * switching here is what lets a reviewer see the DPO record a ruling and then
 * watch the same mutation be refused as Admin. In a real deployment this is
 * replaced by the session's actual role and the switcher disappears.
 */
const ROLES: ActorRole[] = ["admin", "dpo", "grievance_officer", "ciso", "legal"];

export function RoleSwitcher({ current }: { current: ActorRole }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  return (
    <select
      className="input"
      style={{ width: 190, height: 28, fontSize: 12.5, padding: "0 8px" }}
      value={current}
      disabled={pending}
      title="Demo only — switches the acting role so the guards can be exercised"
      onChange={(e) => {
        const next = e.target.value as ActorRole;
        start(async () => {
          await switchRole(next);
          router.refresh();
        });
      }}
    >
      {ROLES.map((role) => (
        <option key={role} value={role}>
          Acting as: {ROLE_LABEL[role]}
        </option>
      ))}
    </select>
  );
}
