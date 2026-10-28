import { getProfile } from "@/lib/setup/state";
import { getSession } from "@/lib/session";
import { ProfileForm } from "@/components/setup/ProfileForm";

export const dynamic = "force-dynamic";

/** S4 — Readiness profile. Full page, no sidebar, a 640px centered column. Org-
 *  level: a second Admin resumes the same half-answered state. */
export default async function ProfilePage() {
  const [profile, session] = await Promise.all([getProfile(), getSession()]);
  return (
    <div style={{ minHeight: "100vh", background: "var(--surface-sunken, #f8fafc)", padding: "40px 16px" }}>
      <div style={{ maxWidth: 640, margin: "0 auto" }}>
        <div className="row" style={{ gap: 8, alignItems: "center", marginBottom: 24 }}>
          <span style={{ width: 28, height: 28, borderRadius: 8, background: "var(--accent, #2563eb)", display: "inline-block" }} />
          <strong>miniOrange Privacy</strong>
        </div>
        <ProfileForm initial={profile} actor={session.actor.label} />
      </div>
    </div>
  );
}
