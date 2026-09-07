import { Shell } from "@/components/Shell";
import { Placeholder } from "@/components/Placeholder";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <Shell active="/settings/users" title={"Users & Roles"}>
      <Placeholder
        title={"Users & Roles"}
        tip={"This product's own privacy roles — who can act as DPO/CISO/Grievance Officer/Admin/Legal — not general system access."}
        what={
          <>
            Tabs: <strong>Users</strong> and <strong>Privacy Roles &amp; Permissions</strong>.
            The access-control layer underneath every &ldquo;Acting as&rdquo; governance
            decision in this product — who may act as DPO, CISO, Grievance Officer, Admin or
            Legal, and what each can approve. General system/infrastructure RBAC stays IAM&rsquo;s
            and is referenced read-only at most.
          </>
        }
      />
    </Shell>
  );
}
