"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveProfileAction } from "@/app/actions/setup";
import { answeredCount, profileComplete, type ProfileAnswers } from "@/lib/setup/plan";

type Opt<T> = { value: T; label: string };
interface Q { key: keyof ProfileAnswers; n: number; q: string; helper?: string; multi?: boolean; options: Opt<string>[] }

const QUESTIONS: Q[] = [
  { key: "industry", n: 1, q: "What does Meridian mainly do?", helper: "Selects the starter pack and, with Q2, decides Rule 8 inactivity erasure.", options: [
    { value: "banking", label: "Banking & financial services" }, { value: "healthcare", label: "Healthcare" }, { value: "ecommerce", label: "E-commerce" }, { value: "gaming", label: "Online gaming" }, { value: "social", label: "Social media" }, { value: "saas", label: "SaaS / technology" }, { value: "education", label: "Education" }, { value: "other", label: "Other" },
  ] },
  { key: "userCount", n: 2, q: "Roughly how many registered users or customers do you have in India?", helper: "Rule 8(1) / Third Schedule thresholds.", options: [
    { value: "under_50l", label: "Under 50 lakh" }, { value: "50l_2cr", label: "50 lakh – 2 crore" }, { value: "over_2cr", label: "Over 2 crore" },
  ] },
  { key: "children", n: 3, q: "Do you process personal data of children (under 18) or of persons with disabilities through a guardian?", helper: "Rules 10–11 (verifiable consent). “Not sure” is treated as applies and flagged for the DPO.", options: [
    { value: "children", label: "Children" }, { value: "disabilities", label: "Persons with disabilities via guardian" }, { value: "neither", label: "Neither" }, { value: "not_sure", label: "Not sure" },
  ] },
  { key: "sdf", n: 4, q: "Has the Central Government notified Meridian as a Significant Data Fiduciary?", helper: "SDF status is notified by the Government, not self-assessed (Section 10). Your DPO confirms it per fiduciary.", options: [
    { value: "yes", label: "Yes" }, { value: "no", label: "No" }, { value: "not_known", label: "Not yet known" },
  ] },
  { key: "processing", n: 5, q: "Do others process personal data for you, or does data go outside India? (choose all that apply)", helper: "Section 8(2) (processor contracts), Section 16 / Rule 15 (transfers).", multi: true, options: [
    { value: "proc_in", label: "Processors in India" }, { value: "proc_out", label: "Processors outside India" }, { value: "transfer_self", label: "We transfer data outside India ourselves" }, { value: "none", label: "None of these" },
  ] },
];

export function ProfileForm({ initial, actor }: { initial: ProfileAnswers; actor: string }) {
  const router = useRouter();
  const [a, setA] = useState<ProfileAnswers>(initial);
  const [, start] = useTransition();
  const [pendingNav, setPendingNav] = useState(false);

  const persist = (next: ProfileAnswers) => { setA(next); start(() => { saveProfileAction(next); }); };
  const setSingle = (key: keyof ProfileAnswers, value: string) => persist({ ...a, [key]: value, startedBy: a.startedBy ?? actor, startedAt: a.startedAt ?? new Date().toISOString() });
  const toggleMulti = (value: string) => {
    const cur = (a.processing ?? []) as string[];
    let next = value === "none" ? ["none"] : cur.filter((v) => v !== "none");
    next = next.includes(value) ? next.filter((v) => v !== value) : [...next, value];
    persist({ ...a, processing: next as ProfileAnswers["processing"], startedBy: a.startedBy ?? actor, startedAt: a.startedAt ?? new Date().toISOString() });
  };

  const done = profileComplete(a);
  const seePlan = () => { setPendingNav(true); start(async () => { await saveProfileAction({ ...a, done: true }); router.push("/setup/plan"); }); };

  return (
    <div className="stack" style={{ gap: 20 }}>
      {a.startedBy && a.startedBy !== actor && !a.done && (
        <div className="notice info" style={{ margin: 0 }}>{a.startedBy} started this{a.startedAt ? ` on ${new Date(a.startedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}` : ""}. Pick up where they left off.</div>
      )}
      <div className="stack" style={{ gap: 6 }}>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
          <h1 className="inv-title" style={{ margin: 0 }}>Let’s tailor the platform to Meridian</h1>
          <span className="cell-sub tnum">{answeredCount(a)} of 5 answered</span>
        </div>
        <p className="cell-sub" style={{ margin: 0 }}>Five questions, about two minutes. Your answers decide which DPDP obligations apply and what to set up first. You can change them later in Settings › Organization.</p>
      </div>

      {QUESTIONS.map((question) => {
        const val = a[question.key];
        return (
          <div key={question.n} className="inv-card stack" style={{ gap: 10 }}>
            <div className="stack" style={{ gap: 2 }}>
              <strong style={{ fontSize: 14 }}>{question.n}. {question.q}</strong>
              {question.helper && <span className="cell-sub">{question.helper}</span>}
            </div>
            <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
              {question.options.map((o) => {
                const active = question.multi ? ((val as string[] | undefined) ?? []).includes(o.value) : val === o.value;
                return (
                  <button key={o.value} className={`btn ${active ? "primary" : "sec"}`} style={{ borderRadius: 999 }}
                    onClick={() => (question.multi ? toggleMulti(o.value) : setSingle(question.key, o.value))}>
                    {active && question.multi ? "✓ " : ""}{o.label}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}

      <div className="row" style={{ justifyContent: "flex-end", paddingTop: 4 }}>
        <button className="btn primary" disabled={!done || pendingNav} onClick={seePlan}>See my plan →</button>
      </div>
    </div>
  );
}
