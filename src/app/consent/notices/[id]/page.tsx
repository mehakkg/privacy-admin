import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentRole } from "@/lib/session";
import { Shell } from "@/components/Shell";
import { Card, Chip, PageHead, Pill } from "@/components/ui";
import {
  NoticeMeta,
  NoticeContentEditor,
  Rule3Panel,
  NoticeVersionHistory,
  NoticeVariants,
  NoticePreview,
  NoticePublish,
  NoticePageActions,
} from "@/components/noticeDetail";
import { decodeList } from "@/lib/codec/json";
import { evaluateRule3, type Rule3Manual } from "@/lib/notices";
import { DATA_CATEGORY_LABEL, type DataCategory } from "@/lib/domain";

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

  const [notice, role] = await Promise.all([
    db.notice.findUnique({
      where: { id },
      include: {
        revisions: { orderBy: { savedAt: "desc" } },
        variants: true,
        fiduciary: true,
        purposeTag: true,
        supersededBy: true,
      },
    }),
    getCurrentRole(),
  ]);
  if (!notice) notFound();

  const [fiduciaries, purposes, otherPublished, notifyUserCount] = await Promise.all([
    db.entity.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.purposeTag.findMany({ where: { status: "approved" }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.notice.findMany({ where: { status: "published", id: { not: id } }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.consentRecord.count(),
  ]);

  const regions = decodeList(notice.regionsJson);
  const pendingRegions = decodeList(notice.pendingRegionsJson ?? "[]");
  const manual: Rule3Manual = JSON.parse(notice.rule3ManualJson || "{}");
  const rule3 = evaluateRule3(notice.content, manual);
  const catLabel = notice.dataCategory ? (DATA_CATEGORY_LABEL[notice.dataCategory as DataCategory] ?? notice.dataCategory) : null;

  return (
    <Shell active="/consent" title={`Notices / ${notice.name}`}>
      <PageHead
        crumbs={[{ label: "Notices", href: "/consent/notices" }, { label: notice.name }]}
        title={notice.name}
        subtitle={
          <span className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            <Pill tone={notice.status === "published" ? "green" : notice.status === "draft" ? "yellow" : "gray"}>
              {notice.status}
            </Pill>
            {notice.approvalState !== "none" && <Pill tone="blue">awaiting DPO</Pill>}
            {notice.fiduciary && <Chip>{notice.fiduciary.name}</Chip>}
            {catLabel && <Chip>{catLabel}</Chip>}
            <span className="mono cell-sub">{notice.currentVersion}</span>
            <span className="cell-sub">· {regions.length ? `${regions.length} region(s)` : "not published"}</span>
            {notice.supersededBy && <span className="cell-sub">· superseded by {notice.supersededBy.name}</span>}
          </span>
        }
        actions={<NoticePageActions noticeId={id} name={notice.name} status={notice.status} supersedeOptions={otherPublished} />}
      />

      <nav className="stepper">
        {TABS.map((t) => {
          const locked = t === "publish" && !rule3.complete;
          return locked ? (
            <span key={t} className="step locked" title="Complete the Rule 3 checklist first">
              <span className="step-label">{TAB_LABEL[t]} 🔒</span>
            </span>
          ) : (
            <Link key={t} href={`/consent/notices/${id}?tab=${t}`} className={`step${t === tab ? " active" : ""}`}>
              <span className="step-label">{TAB_LABEL[t]}</span>
            </Link>
          );
        })}
      </nav>

      {tab === "content" && (
        <div className="stack" style={{ gap: 16 }}>
          <NoticeMeta
            noticeId={id}
            fiduciaryId={notice.fiduciaryId}
            dataCategory={notice.dataCategory}
            purposeTagId={notice.purposeTagId}
            fiduciaries={fiduciaries}
            purposes={purposes}
          />
          <div className="grid-2">
            <Card title="Content">
              <NoticeContentEditor noticeId={id} content={notice.content} />
            </Card>
            <Rule3Panel noticeId={id} content={notice.content} manual={manual} />
          </div>
          <Card title="Version history">
            <NoticeVersionHistory
              noticeId={id}
              revisions={notice.revisions.map((r) => ({
                id: r.id,
                version: r.version,
                content: r.content,
                note: r.note,
                savedBy: r.savedBy,
                savedAt: r.savedAt.toISOString(),
              }))}
            />
          </Card>
        </div>
      )}

      {tab === "variants" && (
        <NoticeVariants
          noticeId={id}
          baseContent={notice.content}
          variants={notice.variants.map((v) => ({ language: v.language, content: v.content }))}
          regions={regions}
        />
      )}

      {tab === "preview" && (
        <NoticePreview
          name={notice.name}
          baseContent={notice.content}
          variants={notice.variants.map((v) => ({ language: v.language, content: v.content }))}
        />
      )}

      {tab === "publish" && (
        rule3.complete ? (
          <NoticePublish
            noticeId={id}
            status={notice.status}
            regions={regions}
            notifyOnChange={notice.notifyOnChange}
            approvalState={notice.approvalState}
            pendingRegions={pendingRegions}
            submittedBy={notice.submittedBy}
            role={role}
            rule3Complete={rule3.complete}
            rule3Satisfied={rule3.satisfied}
            supersedeOptions={otherPublished}
            notifyUserCount={notifyUserCount}
          />
        ) : (
          <Card title="Publish settings">
            <div className="empty">
              <p style={{ margin: "0 0 6px" }}>Publishing is locked until the Rule 3 checklist is complete.</p>
              <p className="cell-sub" style={{ margin: "0 0 12px" }}>{rule3.satisfied}/5 requirements met.</p>
              <Link href={`/consent/notices/${id}?tab=content`} className="btn primary sm">Go to the checklist →</Link>
            </div>
          </Card>
        )
      )}
    </Shell>
  );
}
