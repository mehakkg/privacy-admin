// Deletion-instruction detail now lives under Rights Requests (nav restructure §3
// row 12). Re-export the existing detail page so the move is behaviour-preserving.
export { default } from "@/app/audit-trail/deletions/[id]/page";
export const dynamic = "force-dynamic";
