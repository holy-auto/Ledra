import Link from "next/link";
import { redirect } from "next/navigation";
import PageHeader from "@/components/ui/PageHeader";
import Badge from "@/components/ui/Badge";
import EmptyState from "@/components/ui/EmptyState";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import {
  SITE_CONTENT_TYPE_LABELS,
  SITE_CONTENT_STATUS_LABELS,
  type SiteContentStatus,
  type SiteContentType,
} from "@/lib/validations/site-content-post";
import SiteContentRowActions from "./SiteContentRowActions";

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  type: SiteContentType;
  status: SiteContentStatus;
  slug: string;
  title: string;
  published_at: string | null;
  event_start_at: string | null;
  updated_at: string;
  author: string | null;
};

function statusVariant(status: SiteContentStatus): "success" | "warning" | "default" {
  if (status === "published") return "success";
  if (status === "draft") return "warning";
  return "default";
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${y}/${m}/${day} ${hh}:${mm}`;
}

export default async function SiteContentListPage(props: { searchParams?: Promise<{ type?: string }> }) {
  const searchParams = (await props.searchParams) ?? {};
  const typeFilter = searchParams.type as SiteContentType | undefined;

  const supabase = await createSupabaseServerClient();
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes?.user) redirect("/login?next=/admin/site-content");

  let query = supabase
    .from("site_content_posts")
    .select("id, type, status, slug, title, published_at, event_start_at, updated_at, author")
    .order("updated_at", { ascending: false })
    .limit(100);

  if (typeFilter && (typeFilter === "blog" || typeFilter === "event" || typeFilter === "webinar")) {
    query = query.eq("type", typeFilter);
  }

  const { data: rows, error } = await query;

  const tabs: Array<{ key: SiteContentType | "all"; label: string; href: string }> = [
    { key: "all", label: "すべて", href: "/admin/site-content" },
    { key: "blog", label: "ブログ", href: "/admin/site-content?type=blog" },
    { key: "event", label: "イベント", href: "/admin/site-content?type=event" },
    { key: "webinar", label: "ウェビナー", href: "/admin/site-content?type=webinar" },
  ];

  const activeKey = typeFilter ?? "all";

  return (
    <div className="space-y-6">
      <PageHeader
        tag="SITE CONTENT"
        title="HPコンテンツ管理"
        description="LedraのHPに掲載するブログ・イベント・ウェビナーを作成・編集できます。"
        actions={
          <Link href="/admin/site-content/new" className="btn-primary">
            新規作成
          </Link>
        }
      />

      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => {
          const isActive = activeKey === t.key;
          return (
            <Link
              key={t.key}
              href={t.href}
              className={
                isActive
                  ? "inline-flex items-center rounded-full border border-accent/40 bg-accent-dim px-3 py-1 text-xs font-medium text-accent-text"
                  : "inline-flex items-center rounded-full border border-border-default bg-surface-hover px-3 py-1 text-xs font-medium text-secondary hover:text-primary"
              }
            >
              {t.label}
            </Link>
          );
        })}
      </div>

      {error ? (
        <div className="glass-card p-4 text-sm text-danger-text">読み込みに失敗しました: {error.message}</div>
      ) : !rows || rows.length === 0 ? (
        <EmptyState
          title="コンテンツがまだありません"
          description="「新規作成」からブログ・イベント・ウェビナーを作成できます。"
          action={
            <Link href="/admin/site-content/new" className="btn-primary">
              新規作成
            </Link>
          }
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border-default bg-surface-solid">
          <table className="w-full text-sm">
            <thead className="border-b border-border-default bg-surface-hover text-xs text-muted">
              <tr>
                <th className="px-4 py-3 text-left font-medium">種別</th>
                <th className="px-4 py-3 text-left font-medium">タイトル</th>
                <th className="px-4 py-3 text-left font-medium">ステータス</th>
                <th className="px-4 py-3 text-left font-medium">日付</th>
                <th className="px-4 py-3 text-left font-medium">更新</th>
                <th className="px-4 py-3 text-right font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {(rows as Row[]).map((r) => (
                <tr key={r.id} className="border-b border-border-subtle last:border-0 hover:bg-surface-hover/50">
                  <td className="px-4 py-3 text-xs text-secondary">{SITE_CONTENT_TYPE_LABELS[r.type]}</td>
                  <td className="px-4 py-3">
                    <Link href={`/admin/site-content/${r.id}`} className="font-medium text-primary hover:underline">
                      {r.title}
                    </Link>
                    <div className="mt-0.5 text-[11px] text-muted">/{r.slug}</div>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={statusVariant(r.status)}>{SITE_CONTENT_STATUS_LABELS[r.status]}</Badge>
                  </td>
                  <td className="px-4 py-3 text-xs text-secondary">
                    {r.type === "event" || r.type === "webinar"
                      ? formatDateTime(r.event_start_at)
                      : formatDateTime(r.published_at)}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted">{formatDateTime(r.updated_at)}</td>
                  <td className="px-4 py-3 text-right">
                    <SiteContentRowActions id={r.id} status={r.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
