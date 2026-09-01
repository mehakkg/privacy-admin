"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, Pill } from "@/components/ui";
import { ActionError } from "@/components/actions";
import {
  publishNoticeAction,
  saveNoticeContentAction,
  saveVariantAction,
} from "@/app/actions/consent";
import { REGIONS, SCHEDULE_8_LANGUAGES } from "@/lib/domain";
import type { ActionResult } from "@/app/actions/requests";

function useAction() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const run = (op: () => Promise<ActionResult>, after?: () => void) =>
    start(async () => {
      const r = await op();
      setResult(r);
      if (r.ok) {
        after?.();
        router.refresh();
      }
    });
  return { pending, result, run };
}

export function NoticeContentEditor({ noticeId, content }: { noticeId: string; content: string }) {
  const { pending, result, run } = useAction();
  const [value, setValue] = useState(content);
  const [note, setNote] = useState("");

  return (
    <div>
      <textarea
        className="input"
        style={{ minHeight: 220, fontFamily: "var(--font)", lineHeight: 1.5 }}
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      <input
        className="input"
        style={{ marginTop: 8 }}
        placeholder="What changed in this version? (saved to history)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <div className="row" style={{ marginTop: 10 }}>
        <button
          className="btn primary"
          disabled={pending || value === content}
          onClick={() => run(() => saveNoticeContentAction(noticeId, value, note), () => setNote(""))}
        >
          {pending ? "Saving…" : "Save new version"}
        </button>
        <span className="cell-sub">Each save bumps the version and lands in history.</span>
      </div>
      <ActionError result={result} />
    </div>
  );
}

export function NoticeVariants({
  noticeId,
  baseContent,
  variants,
}: {
  noticeId: string;
  baseContent: string;
  variants: { language: string; content: string }[];
}) {
  const { pending, result, run } = useAction();
  const byLang = new Map(variants.map((v) => [v.language, v.content]));
  const [active, setActive] = useState(variants[0]?.language ?? "en");
  const [value, setValue] = useState(byLang.get(active) ?? "");

  const pick = (lang: string) => {
    setActive(lang);
    setValue(byLang.get(lang) ?? "");
  };

  return (
    <Card title="Language variants">
      <p className="cell-sub" style={{ marginTop: 0 }}>
        Eighth Schedule languages (DPDP s.5(3)). A variant with no content falls
        back to the base notice.
      </p>
      <div className="row" style={{ gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
        {SCHEDULE_8_LANGUAGES.map((l) => (
          <button
            key={l.code}
            className={`btn xs ${active === l.code ? "primary" : "ghost"}`}
            onClick={() => pick(l.code)}
          >
            {l.label}
            {byLang.has(l.code) && byLang.get(l.code) ? " ✓" : ""}
          </button>
        ))}
      </div>
      <textarea
        className="input"
        style={{ minHeight: 180, lineHeight: 1.5 }}
        placeholder={`Translated content for ${active}. Leave blank to fall back to: “${baseContent.slice(0, 60)}…”`}
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      <div className="row" style={{ marginTop: 10 }}>
        <button
          className="btn primary"
          disabled={pending}
          onClick={() => run(() => saveVariantAction(noticeId, active, value))}
        >
          {pending ? "Saving…" : `Save ${active} variant`}
        </button>
      </div>
      <ActionError result={result} />
    </Card>
  );
}

export function NoticePreview({ content, name }: { content: string; name: string }) {
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");

  return (
    <Card
      title="Preview"
      actions={
        <div className="row" style={{ gap: 4 }}>
          <button className={`btn xs ${device === "desktop" ? "primary" : "ghost"}`} onClick={() => setDevice("desktop")}>
            Desktop
          </button>
          <button className={`btn xs ${device === "mobile" ? "primary" : "ghost"}`} onClick={() => setDevice("mobile")}>
            Mobile
          </button>
        </div>
      }
    >
      <div style={{ display: "grid", placeItems: "center", padding: 16, background: "var(--bg-page)", borderRadius: "var(--radius-md)" }}>
        <div
          style={{
            width: device === "mobile" ? 320 : "100%",
            maxWidth: device === "mobile" ? 320 : 640,
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-md)",
            background: "var(--bg)",
            padding: 20,
            transition: "width 0.2s",
          }}
        >
          <h3 style={{ marginTop: 0, fontSize: 16 }}>{name}</h3>
          <p style={{ fontSize: 13.5, lineHeight: 1.6, color: "var(--text-2)", whiteSpace: "pre-wrap" }}>
            {content || "No content yet — add it on the Content & Versions tab."}
          </p>
        </div>
      </div>
    </Card>
  );
}

export function NoticePublish({
  noticeId,
  regions,
  notifyOnChange,
}: {
  noticeId: string;
  regions: string[];
  notifyOnChange: boolean;
}) {
  const { pending, result, run } = useAction();
  const [selected, setSelected] = useState<string[]>(regions);
  const [notify, setNotify] = useState(notifyOnChange);

  const toggle = (code: string) =>
    setSelected((s) => (s.includes(code) ? s.filter((x) => x !== code) : [...s, code]));

  return (
    <Card title="Publish settings">
      <div className="section-label">Regions</div>
      <div className="row" style={{ gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
        {REGIONS.map((r) => (
          <button
            key={r.code}
            className={`btn sm ${selected.includes(r.code) ? "primary" : "ghost"}`}
            onClick={() => toggle(r.code)}
          >
            {r.label}
          </button>
        ))}
      </div>

      <label className="row" style={{ gap: 8, marginBottom: 14 }}>
        <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
        <span>Notify existing users when this notice changes</span>
      </label>

      <div className="row">
        <button
          className="btn primary"
          disabled={pending}
          onClick={() => run(() => publishNoticeAction(noticeId, selected, notify))}
        >
          {pending ? "Saving…" : selected.length ? "Publish" : "Save as draft"}
        </button>
        {selected.length === 0 && <Pill tone="yellow">No regions — stays draft</Pill>}
      </div>
      <ActionError result={result} />
    </Card>
  );
}
