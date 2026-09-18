import type { ReactNode } from "react";
import { Shell } from "@/components/Shell";
import { AccessTabs } from "@/components/access/AccessTabs";

/**
 * IDENTITY & ACCESS — top-level module. Sub-tabs: Roles | Assignments |
 * Approval Queue | Drift, over the single Role / RoleAssignment / DriftRecord
 * data model. (The permission matrix lives at /access/rbac-matrix.)
 */
export default function AccessLayout({ children }: { children: ReactNode }) {
  return (
    <Shell active="/access" title="Identity & Access">
      <AccessTabs />
      {children}
    </Shell>
  );
}
