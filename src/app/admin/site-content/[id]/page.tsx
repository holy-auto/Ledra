import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import PageHeader from "@/components/ui/PageHeader";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import SiteContentForm, { type SiteContentFormInitial } from "../SiteContentForm";
import type { SiteContentStatus, SiteContentType } from "@/lib/validations/site-content-post";

export const dynamic = "force-dynamic";

export default async function SiteContentEditPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;

  const supabase = await createSupabaseServerClient();
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes?.user) redirect(`/login?next=/admin/site-content/${id}`);

  const { data: row, error } = await supabase
    .from("site_content_posts")
    .select(
      "id, type, status, slug, title, excerpt, body, hero_image_url, tags, author, published_at, event_start_at, event_end_at, location, online_url, capacity, registration_url",
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return (
      <div className="space-y-4">
        <PageHeader tag="SITE CONTENT" title="編集" />
        <div className="glass-card p-4 text-sm text-danger-text">読み込みに失敗しました: {error.message}</div>
      </div>
    );
  }
  if (!row) notFound();

  const initial: SiteContentFormInitial = {
    id: row.id as string,
    type: row.type as SiteContentType,
    status: row.status as SiteContentStatus,
    slug: (row.slug as string) ?? "",
    title: (row.title as string) ?? "",
    excerpt: (row.excerpt as string | null) ?? "",
    body: (row.body as string) ?? "",
    hero_image_url: (row.hero_image_url as string | null) ?? "",
    tags: Array.isArray(row.tags) ? (row.tags as string[]) : [],
    author: (row.author as string | null) ?? "",
    published_at: (row.published_at as string | null) ?? null,
    event_start_at: (row.event_start_at as string | null) ?? null,
    event_end_at: (row.event_end_at as string | null) ?? null,
    location: (row.location as string | null) ?? "",
    online_url: (row.online_url as string | null) ?? "",
    capacity: (row.capacity as number | null) ?? null,
    registration_url: (row.registration_url as string | null) ?? "",
  };

  return (
    <div className="space-y-6">
      <PageHeader
        tag="SITE CONTENT"
        title="編集"
        description={initial.title}
        actions={
          <Link href="/admin/site-content" className="btn-secondary">
            一覧へ戻る
          </Link>
        }
      />
      <SiteContentForm initial={initial} />
    </div>
  );
}
