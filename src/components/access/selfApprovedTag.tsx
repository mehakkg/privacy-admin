import { UserCog } from "lucide-react";

/**
 * Permanent historical marker: this record was approved under combined
 * Admin+DPO governance (requester and approver the same person). Shown wherever
 * approval history appears; never removed if the org later gets a dedicated DPO.
 */
export function SelfApprovedTag({ compact = false }: { compact?: boolean }) {
  return (
    <span className="self-approved-tag" title="Approved under single-person (Admin + DPO) governance at the time — a permanent historical record.">
      <UserCog size={11} /> {compact ? "Self-approved" : "Self-approved — single-person governance"}
    </span>
  );
}
