import { AuthShell } from "@/components/auth/AuthShell";
import { InviteAccept } from "@/components/auth/InviteAccept";
import { ROLE_PERSON, type SetupRole } from "@/lib/setup/tasks";

export const dynamic = "force-dynamic";

/** S2 — Accept invitation. The token encodes the invited role (demo). */
export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const role: SetupRole = (["admin", "dpo", "ciso", "grievance"] as const).includes(token as SetupRole) ? (token as SetupRole) : "dpo";
  const invitedBy = role === "admin" ? undefined : "Ritu Nair";
  return (
    <AuthShell>
      <InviteAccept token={token} org="Meridian Financial Services" role={role} person={ROLE_PERSON[role]} invitedBy={invitedBy} />
    </AuthShell>
  );
}
