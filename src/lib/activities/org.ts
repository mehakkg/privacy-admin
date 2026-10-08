/** Org directory + option lists for Processing Activities pickers (client-safe). */
import type { Principal } from "@/lib/activities/types";

export interface OrgUser { id: string; name: string; department: string; roles: ("admin" | "dpo")[] }
export const USERS: OrgUser[] = [
  { id: "r-iyer", name: "R. Iyer", department: "IT", roles: ["admin"] },
  { id: "k-menon", name: "K. Menon", department: "Legal", roles: ["dpo"] },
  { id: "p-shah", name: "P. Shah", department: "Credit", roles: ["admin"] },
  { id: "a-rao", name: "A. Rao", department: "Marketing", roles: ["admin"] },
  { id: "s-nair", name: "S. Nair", department: "Customer Operations", roles: ["admin"] },
  { id: "d-verma", name: "D. Verma", department: "HR", roles: ["admin"] },
];
export const userByName = (name: string | null) => USERS.find((u) => u.name === name) ?? null;

export const DEPARTMENTS = ["Credit", "Marketing", "Customer Operations", "Finance", "HR", "Risk", "IT", "Legal"];

export const PRINCIPAL_OPTIONS: { id: Principal; label: string }[] = [
  { id: "customers", label: "Customers" },
  { id: "employees", label: "Employees" },
  { id: "job_applicants", label: "Job applicants" },
  { id: "vendor_staff", label: "Vendors’ staff" },
  { id: "children", label: "Children" },
];
export const PRINCIPAL_LABEL: Record<string, string> = Object.fromEntries(PRINCIPAL_OPTIONS.map((p) => [p.id, p.label]));

export function initials(name: string): string {
  return name.split(/\s+/).map((p) => p.replace(/[^A-Za-z]/g, "").charAt(0)).filter(Boolean).slice(0, 2).join("").toUpperCase() || "?";
}
