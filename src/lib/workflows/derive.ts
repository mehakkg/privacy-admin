import { WORKFLOWS, TASK_INDEX, DATA_ISSUES, TOTAL_TASKS, type WFStep } from "./data";

export type Norm = "Built" | "Partial" | "Not Built" | "Unknown";

export function normStatus(raw: string): Norm {
  const s = String(raw || "").toLowerCase();
  if (s.includes("not built")) return "Not Built";
  if (s === "missing") return "Not Built";
  if (s.includes("partial")) return "Partial";
  if (s.includes("built")) return "Built";
  return "Unknown";
}

/** Step type by the task's first verb (matches the workbook's rule). */
export function stepType(task: string): string {
  const low = task.trim().toLowerCase();
  if (low.startsWith("system auto") || low.startsWith("auto-") || low.startsWith("auto ")) return "System";
  const starts = (w: string) => low === w || low.startsWith(w + " ") || low.startsWith(w + "-");
  if (starts("receive") || starts("await")) return "Intake";
  if (starts("approve") || starts("sign off") || low.startsWith("issue a documented ruling") || starts("adjudicate") || starts("define") || low.startsWith("set rule strictness")) return "Decision";
  if (starts("verify") || starts("confirm") || starts("validate") || starts("check") || starts("cross-check") || starts("review")) return "Verification";
  if (starts("notify") || starts("send") || starts("communicate") || starts("inform") || starts("deliver") || low.startsWith("hand off") || starts("route") || starts("escalate")) return "Handoff / Notify";
  if (starts("log") || starts("document") || starts("export") || starts("compile")) return "Evidence";
  return "Action";
}

export interface PlanStep {
  stepNo: string; role: string; task: string; srcMod: string; isGap: boolean; alt: boolean;
  feature: string; capability: string; status: string; norm: Norm; priority: string;
  stepType: string; handoff: string; notes: string;
}
export interface PlanWF {
  id: string; name: string; domain: string; trigger: string; gap: string | null;
  roles: string[]; steps: PlanStep[];
  Steps: number; Built: number; Partial: number; NotBuilt: number; Unknown: number; readiness: number;
}
export interface Plan {
  workflows: PlanWF[]; domains: string[];
  totals: { workflows: number; steps: number; gaps: number; standalone: number; overall: number };
  unmapped: { module: string; role: string; task: string; status: string; priority: string }[];
  dataIssues: string[];
}

function buildSteps(wf: typeof WORKFLOWS[number]): PlanStep[] {
  return wf.steps.map((st: WFStep, i: number) => {
    const ordinal = i + 1;
    const isGap = !!st.gap;
    const rec = isGap ? null : TASK_INDEX[st.task];
    const notes: string[] = [];
    if (isGap) notes.push("No task exists in Features — add to backlog");
    if (st.alt) notes.push("Alternate branch");
    if (st.note) notes.push(st.note);
    if (wf.id === "WF-BR-01" && i === 0 && wf.step1note) notes.push(wf.step1note);
    const next = wf.steps[i + 1];
    const handoff = next ? (next.role !== st.role ? next.role : "") : "END";
    const status = isGap ? "Missing" : (rec ? rec.status : "");
    return {
      stepNo: (st.alt ? "B" : "") + ordinal, role: st.role, task: st.task,
      srcMod: isGap ? "—" : (rec ? rec.module : "—"), isGap, alt: !!st.alt,
      feature: isGap ? "—" : (rec ? rec.feature : ""), capability: isGap ? "—" : (rec ? rec.capability : ""),
      status, norm: normStatus(status), priority: isGap ? "—" : (rec ? rec.priority : ""),
      stepType: stepType(st.task), handoff, notes: notes.join(" · "),
    };
  });
}

export function buildPlan(): Plan {
  const mapped = new Set<string>();
  const workflows: PlanWF[] = WORKFLOWS.map((wf) => {
    const steps = buildSteps(wf);
    const roles: string[] = [];
    for (const s of wf.steps) if (!roles.includes(s.role)) roles.push(s.role);
    let Built = 0, Partial = 0, NotBuilt = 0, Unknown = 0;
    for (const s of steps) {
      if (!s.isGap) mapped.add(s.task);
      if (s.norm === "Built") Built++; else if (s.norm === "Partial") Partial++; else if (s.norm === "Not Built") NotBuilt++; else Unknown++;
    }
    const Steps = steps.length;
    const readiness = Steps ? (Built + 0.5 * Partial) / Steps : 0;
    return { id: wf.id, name: wf.name, domain: wf.domain, trigger: wf.trigger, gap: wf.gap, roles, steps, Steps, Built, Partial, NotBuilt, Unknown, readiness };
  });

  const domains: string[] = [];
  for (const w of workflows) if (!domains.includes(w.domain)) domains.push(w.domain);

  const unmapped = Object.entries(TASK_INDEX)
    .filter(([task]) => !mapped.has(task))
    .map(([task, r]) => ({ module: r.module, role: r.role, task, status: r.status, priority: r.priority }));

  const steps = workflows.reduce((n, w) => n + w.Steps, 0);
  const gaps = workflows.reduce((n, w) => n + w.steps.filter((s) => s.isGap).length, 0);
  const overall = workflows.length
    ? workflows.reduce((n, w) => n + w.readiness, 0) / workflows.length
    : 0;

  return {
    workflows, domains,
    totals: { workflows: workflows.length, steps, gaps, standalone: unmapped.length, overall },
    unmapped, dataIssues: DATA_ISSUES,
  };
}

export { TOTAL_TASKS };
