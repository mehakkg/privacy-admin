import type { ReactNode } from "react";
import Link from "next/link";
import { Shell } from "@/components/Shell";

const TABS = [
  { href: "/access/provisioning", label: "Provisioning" },
  { href: "/access/deprovisioning", label: "Deprovisioning" },
  { href: "/access/verification", label: "Revocation verification" },
  { href: "/access/dormant", label: "Dormant accounts" },
  { href: "/access/roles", label: "RBAC matrix" },
];

export default function AccessLayout({ children }: { children: ReactNode }) {
  return (
    <Shell active="/access" title="Identity & Access">
      <nav className="stepper">
        {TABS.map((tab) => (
          <Link key={tab.href} href={tab.href} className="step">
            {tab.label}
          </Link>
        ))}
      </nav>
      {children}
    </Shell>
  );
}
