"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { X, Check, AlertTriangle, Plus, Database, Users, Building } from "lucide-react";
import { dismissProvisionBannerAction, dismissGettingStartedAction, renameEntityAction } from "@/app/actions/orgOnboarding";

export interface BannerState {
  showWelcome: boolean;
  welcomeText: string;
  showGettingStarted: boolean;
  showIncomplete: boolean;
  incompleteReason: string;
  primaryEntity: { id: string; name: string } | null;
  items: { source: boolean; teammates: boolean; anotherEntity: boolean };
}

export function OnboardingBanners({ state }: { state: BannerState }) {
  const router = useRouter();
  const [, start] = useTransition();
  const [welcome, setWelcome] = useState(state.showWelcome);
  const [gs, setGs] = useState(state.showGettingStarted);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(state.primaryEntity?.name ?? "");

  const run = (op: () => Promise<unknown>) => start(async () => { await op(); router.refresh(); });

  return (
    <div className="stack" style={{ gap: 12, marginBottom: 16 }}>
      {/* Non-dismissible incomplete-state safety net */}
      {state.showIncomplete && (
        <div className="onb-incomplete">
          <AlertTriangle size={16} />
          <div className="stack" style={{ gap: 2 }}>
            <strong>Your setup is incomplete</strong>
            <span>{state.incompleteReason}</span>
          </div>
          <Link href="/get-started" className="btn sm" style={{ marginLeft: "auto" }}>Finish setup →</Link>
        </div>
      )}

      {/* One-time provisioning confirmation */}
      {welcome && (
        <div className="onb-welcome">
          <Check size={16} color="var(--green)" />
          <div className="stack" style={{ gap: 4, flex: 1, minWidth: 0 }}>
            <span>{state.welcomeText}</span>
            {state.primaryEntity && (
              <span className="row" style={{ gap: 6, alignItems: "center" }}>
                {editing ? (
                  <>
                    <input className="input sm" value={name} onChange={(e) => setName(e.target.value)} style={{ width: 200 }} autoFocus />
                    <button className="btn primary xs" onClick={() => { run(() => renameEntityAction(state.primaryEntity!.id, name)); setEditing(false); }}>Save</button>
                    <button className="btn ghost xs" onClick={() => { setName(state.primaryEntity!.name); setEditing(false); }}>Cancel</button>
                  </>
                ) : (
                  <>
                    <span className="cell-sub">Entity: <strong>{state.primaryEntity.name}</strong></span>
                    <button className="linklike" style={{ fontSize: 12 }} onClick={() => setEditing(true)}>Rename</button>
                  </>
                )}
                <Link href="/get-started" className="linklike" style={{ fontSize: 12, marginLeft: 8 }}><Plus size={11} style={{ verticalAlign: "-1px" }} /> Add another entity</Link>
              </span>
            )}
          </div>
          <button className="icon-btn" aria-label="Dismiss" onClick={() => { setWelcome(false); run(() => dismissProvisionBannerAction()); }}><X size={15} /></button>
        </div>
      )}

      {/* Getting Started checklist */}
      {gs && (
        <div className="onb-getting-started">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <strong>Getting started</strong>
            <button className="icon-btn" aria-label="Dismiss" onClick={() => { setGs(false); run(() => dismissGettingStartedAction()); }}><X size={15} /></button>
          </div>
          <div className="stack" style={{ gap: 6, marginTop: 8 }}>
            <GsItem done={state.items.source} icon={<Database size={14} />} label="Connect a data source" href="/discovery/sources" />
            <GsItem done={state.items.teammates} icon={<Users size={14} />} label="Invite teammates" href="/access/assignments" />
            <GsItem done={state.items.anotherEntity} icon={<Building size={14} />} label="Add another entity" href="/get-started" />
          </div>
        </div>
      )}
    </div>
  );
}

function GsItem({ done, icon, label, href }: { done: boolean; icon: React.ReactNode; label: string; href: string }) {
  return (
    <Link href={href} className={`onb-gs-item${done ? " done" : ""}`}>
      <span className="onb-gs-check">{done ? <Check size={13} /> : icon}</span>
      <span>{label}</span>
      {!done && <span className="cell-sub" style={{ marginLeft: "auto" }}>Open →</span>}
    </Link>
  );
}
