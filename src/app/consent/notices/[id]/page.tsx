import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { Shell } from "@/components/Shell";
import { Card, PageHead, Pill, formatDateTime } from "@/components/ui";
import {
  NoticeContentEditor,
  NoticeVariants,
  NoticePreview,
  NoticePublish,
} from "@/components/noticeDetail";
import { decodeList } from "@/lib/codec/json";

export const dynamic = "force-dynamic";

const TABS = ["content", "variants", "preview", "publish"] as const;
type Tab = (typeof TABS)[number];
const TAB_LABEL: Record<Tab, string> = {
  content: "Content & Versions",
  variants: "Language Variants",
  preview: "Preview",
  publish: "Publish Settings",
};

export default async function NoticeDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const { tab: rawTab } = await searchParams;
  const tab: Tab = (TABS as readonly string[]).includes(rawTab ?? "") ? (rawTab as Tab) : "content";

  const notice = await db.notice.findUnique({
    where: { id },
    include: {
      revisions: { orderBy: { savedAt: "desc" } },
      variants: true,
    },
  });
  if (!notice) notFound();

  const regions = decodeList(notice.regionsJson);

  return (
    <Shell active="/consent" title={`Notices / ${notice.name}`}>
      <PageHead
        crumbs={[{ label: "Notices", href: "/consent/notices" }, { label: notice.name }]}
        title={notice.name}
        subtitle={
          <span className="row" style={{ gap: 8 }}>
            <Pill tone={notice.status === "published" ? "green" : notice.status === "draft" ? "yellow" : "gray"}>
              {notice.status}
            </Pill>
            <span className="mono cell-sub">{notice.currentVersion}</span>
            <span className="cell-sub">
              {regions.length ? `${regions.length} region(s)` : "not published"}
            </span>
          </span>
        }
      />

      <nav className="stepper">
        {TABS.map((t) => (
          <Link
            key={t}
            href={`/consent/notices/${id}?tab=${t}`}
            className={`step${t === tab ? " active" : ""}`}
          >
            <span className="step-label">{TAB_LABEL[t]}</span>
          </Link>
        ))}
      </nav>

      {tab === "content" && (
        <div className="grid-2">
          <Card title="Content">
            <NoticeContentEditor noticeId={id} content={notice.content} />
          </Card>
          <Card title="Version history">
            {notice.revisions.length === 0 ? (
              <div className="empty">No saved versions yet.</div>
            ) : (
              <div className="stack" style={{ gap: 10 }}>
                {notice.revisions.map((r) => (
                  <div key={r.id} className="row" style={{ gap: 8, alignItems: "flex-start" }}>
                    <span className="mono cell-primary">{r.version}</span>
                    <div className="cell-stack">
                      <span className="cell-sub">{r.note ?? "—"}</span>
                      <span className="cell-sub">
                        {r.savedBy} · {formatDateTime(r.savedAt)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {tab === "variants" && (
        <NoticeVariants
          noticeId={id}
          baseContent={notice.content}
          variants={notice.variants.map((v) => ({ language: v.language, content: v.content }))}
        />
      )}

      {tab === "preview" && (
        <NoticePreview
          content={notice.content}
          name={notice.name}
        />
      )}

      {tab === "publish" && (
        <NoticePublish
          noticeId={id}
          regions={regions}
          notifyOnChange={notice.notifyOnChange}
        />
      )}
    </Shell>
  );
}
