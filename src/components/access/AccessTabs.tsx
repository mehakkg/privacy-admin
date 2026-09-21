"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/access/roles", label: "Roles" },
  { href: "/access/assignments", label: "Assignments" },
  { href: "/access/approval-queue", label: "Approval Queue" },
  { href: "/access/drift", label: "Drift" },
  { href: "/access/insights", label: "Insights" },
  { href: "/access/assessments", label: "Assessments" },
  { href: "/access/organization", label: "Governance Setup" },
];

export function AccessTabs() {
  const pathname = usePathname();
  return (
    <nav className="stepper" style={{ marginBottom: 16 }}>
      {TABS.map((tab) => {
        const active = pathname === tab.href || pathname.startsWith(tab.href + "/");
        return (
          <Link key={tab.href} href={tab.href} className={`step${active ? " active" : ""}`}>
            <span className="step-label">{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
