import { db } from "@/lib/db";
import { Shell } from "@/components/Shell";
import { PageHead, formatDate } from "@/components/ui";
import { UsersDirectory, type UserAccount } from "@/components/settings/UsersDirectory";
import { RevocationVerification } from "@/components/RevocationVerification";

export const dynamic = "force-dynamic";

/**
 * SETTINGS → USERS — a lightweight account directory. Deliberately holds NO role,
 * capability or permission data: Identity & Access is the sole owner of access.
 * The only mutation here is account-level deactivation, which calls the existing
 * cross-system revocation flow (RevocationVerification, below) rather than
 * duplicating it or editing roles.
 */
export default async function UsersPage() {
  const users = await db.internalUser.findMany({ orderBy: [{ accountStatus: "asc" }, { fullName: "asc" }] });

  const rows: UserAccount[] = users.map((u) => ({
    id: u.id,
    name: u.fullName,
    email: u.email,
    accountStatus: u.accountStatus,
    dateAdded: formatDate(u.joinedAt),
  }));

  return (
    <Shell active="/settings/users" title="Users">
      <PageHead
        title="Users"
        titleTip="A directory of user accounts — name, email, account status. Roles, capabilities and access assignment live in Identity & Access, not here."
      />

      <UsersDirectory users={rows} />

      <div style={{ marginTop: 24, borderTop: "1px solid var(--border)", paddingTop: 16 }}>
        <h3 style={{ margin: "0 0 4px", fontSize: 14 }}>Cross-system revocation</h3>
        <p className="cell-sub" style={{ margin: "0 0 12px" }}>Deactivating an account above runs the same revocation checklist offboarding uses. Its state is tracked per system here until confirmed.</p>
        {/* Reused verbatim from Identity & Access deprovisioning — not rebuilt. */}
        <RevocationVerification />
      </div>
    </Shell>
  );
}
