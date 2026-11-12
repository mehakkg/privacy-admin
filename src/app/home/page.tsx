import { OverviewApp } from "@/components/overview/OverviewApp";

export const dynamic = "force-dynamic";

/**
 * Overview — the redesigned command-center dashboard (comp rebuild). Its own
 * white-sidebar shell, with a demo-state toggle between the first-time and
 * frequent-admin experiences and the Operations / Data health / Compliance tabs.
 */
export default function HomePage() {
  return <OverviewApp />;
}
