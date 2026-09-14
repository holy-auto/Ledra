"use server";

import { revalidatePath } from "next/cache";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { jstLocalInputToUtcIso } from "@/lib/datetime";
import { resolveCallerWithRole, requirePermission } from "@/lib/auth/checkRole";
import {
  parseSiteContentFormData,
  siteContentPostSchema,
  type SiteContentStatus,
  type SiteContentType,
} from "@/lib/validations/site-content-post";

type Ok<T> = { ok: true; data: T };
type Err = { ok: false; error: string; fieldErrors?: Record<string, string> };
export type ActionResult<T> = Ok<T> | Err;

type AuthContext = {
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  userId: string;
  tenantId: string | null;
};

async function authorize(): Promise<AuthContext | Err> {
  const supabase = await createSupabaseServerClient();
  const caller = await resolveCallerWithRole(supabase);
  if (!caller) return { ok: false, error: "unauthorized" };

  // サイトコンテンツは Ledra の公開サイト（ブログ/ニュース/イベント）で、
  // プラットフォーム運営のもの。**super_admin のみ**。
  //
  // ここは長く `hasMinRole(role, "staff")` を要求していたが、DB の RLS は
  // `is_super_admin_user()` しか通さない（20260424010000 のヘッダに
  // 「加盟店（owner/admin/staff/viewer）はDB直接操作でも変更不可」と明記）。
  // その結果、staff/admin/owner はアプリのガードを通過してから RLS に弾かれ、
  // **UPDATE と DELETE は 0 行・エラー無しで「成功」が返っていた。**
  // 権限側も super_admin 限定に直したので、ここは表と同じ動詞で見る。
  if (!requirePermission(caller, "site_content:manage")) {
    return { ok: false, error: "forbidden" };
  }

  // ローカルの membership 引きは並び順もアクティブテナントの cookie も見ておらず、
  // 複数テナント所属で別テナントを返しうる。caller から取る。
  return {
    supabase,
    userId: caller.userId,
    tenantId: caller.tenantId,
  };
}

function isErr(v: AuthContext | Err): v is Err {
  return (v as Err).ok === false;
}

function revalidatePublicPaths(type: SiteContentType) {
  revalidatePath("/admin/site-content");
  if (type === "blog") revalidatePath("/blog");
  if (type === "news") {
    revalidatePath("/news");
    revalidatePath("/"); // トップの NewsTeaser も更新する
  }
  if (type === "event" || type === "webinar") revalidatePath("/events");
}

function flattenZodErrors(err: unknown): Record<string, string> {
  const result: Record<string, string> = {};
  if (err && typeof err === "object" && "issues" in err && Array.isArray((err as { issues: unknown[] }).issues)) {
    for (const issue of (err as { issues: { path: (string | number)[]; message: string }[] }).issues) {
      const key = issue.path.join(".") || "_root";
      if (!result[key]) result[key] = issue.message;
    }
  }
  return result;
}

export async function createSiteContentAction(
  fd: FormData,
): Promise<ActionResult<{ id: string; type: SiteContentType }>> {
  const auth = await authorize();
  if (isErr(auth)) return auth;

  const parsed = siteContentPostSchema.safeParse(parseSiteContentFormData(fd));
  if (!parsed.success) {
    return { ok: false, error: "validation_error", fieldErrors: flattenZodErrors(parsed.error) };
  }
  const input = parsed.data;

  const published_at =
    jstLocalInputToUtcIso(input.published_at) ?? (input.status === "published" ? new Date().toISOString() : null);

  const { data, error } = await auth.supabase
    .from("site_content_posts")
    .insert({
      tenant_id: auth.tenantId,
      type: input.type,
      status: input.status,
      slug: input.slug,
      title: input.title,
      excerpt: input.excerpt ?? null,
      body: input.body ?? "",
      hero_image_url: input.hero_image_url ?? null,
      tags: input.tags ?? [],
      author: input.author ?? null,
      published_at,
      event_start_at: jstLocalInputToUtcIso(input.event_start_at),
      event_end_at: jstLocalInputToUtcIso(input.event_end_at),
      location: input.location ?? null,
      online_url: input.online_url ?? null,
      capacity: input.capacity ?? null,
      registration_url: input.registration_url ?? null,
      cta_title: input.cta_title ?? null,
      cta_subtitle: input.cta_subtitle ?? null,
      cta_primary_label: input.cta_primary_label ?? null,
      cta_primary_href: input.cta_primary_href ?? null,
      cta_secondary_label: input.cta_secondary_label ?? null,
      cta_secondary_href: input.cta_secondary_href ?? null,
      og_title: input.og_title ?? null,
      og_subtitle: input.og_subtitle ?? null,
      created_by: auth.userId,
    })
    .select("id, type")
    .single();

  if (error) {
    if (error.code === "23505") {
      return {
        ok: false,
        error: "duplicate_slug",
        fieldErrors: { slug: "このスラッグは既に使われています。別のスラッグを指定してください。" },
      };
    }
    return { ok: false, error: error.message };
  }

  revalidatePublicPaths(input.type);
  return { ok: true, data: { id: data.id as string, type: data.type as SiteContentType } };
}

export async function updateSiteContentAction(
  id: string,
  fd: FormData,
): Promise<ActionResult<{ id: string; type: SiteContentType }>> {
  const auth = await authorize();
  if (isErr(auth)) return auth;

  const parsed = siteContentPostSchema.safeParse(parseSiteContentFormData(fd));
  if (!parsed.success) {
    return { ok: false, error: "validation_error", fieldErrors: flattenZodErrors(parsed.error) };
  }
  const input = parsed.data;

  const { data: existing, error: fetchErr } = await auth.supabase
    .from("site_content_posts")
    .select("id, published_at")
    .eq("id", id)
    .maybeSingle();

  if (fetchErr) return { ok: false, error: fetchErr.message };
  if (!existing) return { ok: false, error: "not_found" };

  const published_at =
    jstLocalInputToUtcIso(input.published_at) ??
    (input.status === "published" ? ((existing.published_at as string | null) ?? new Date().toISOString()) : null);

  const { data, error } = await auth.supabase
    .from("site_content_posts")
    .update({
      type: input.type,
      status: input.status,
      slug: input.slug,
      title: input.title,
      excerpt: input.excerpt ?? null,
      body: input.body ?? "",
      hero_image_url: input.hero_image_url ?? null,
      tags: input.tags ?? [],
      author: input.author ?? null,
      published_at,
      event_start_at: jstLocalInputToUtcIso(input.event_start_at),
      event_end_at: jstLocalInputToUtcIso(input.event_end_at),
      location: input.location ?? null,
      online_url: input.online_url ?? null,
      capacity: input.capacity ?? null,
      registration_url: input.registration_url ?? null,
      cta_title: input.cta_title ?? null,
      cta_subtitle: input.cta_subtitle ?? null,
      cta_primary_label: input.cta_primary_label ?? null,
      cta_primary_href: input.cta_primary_href ?? null,
      cta_secondary_label: input.cta_secondary_label ?? null,
      cta_secondary_href: input.cta_secondary_href ?? null,
      og_title: input.og_title ?? null,
      og_subtitle: input.og_subtitle ?? null,
    })
    .eq("id", id)
    .select("id, type")
    .single();

  if (error) {
    if (error.code === "23505") {
      return {
        ok: false,
        error: "duplicate_slug",
        fieldErrors: { slug: "このスラッグは既に使われています。別のスラッグを指定してください。" },
      };
    }
    return { ok: false, error: error.message };
  }

  revalidatePublicPaths(input.type);
  return { ok: true, data: { id: data.id as string, type: data.type as SiteContentType } };
}

export async function deleteSiteContentAction(id: string): Promise<ActionResult<null>> {
  const auth = await authorize();
  if (isErr(auth)) return auth;

  const { data: row } = await auth.supabase.from("site_content_posts").select("type").eq("id", id).maybeSingle();
  // 他の3アクションと同じく、存在しない id は not_found として返す。
  // これが無いと、二度押しや古いリンクが「権限がありません」に化ける。
  if (!row) return { ok: false, error: "not_found" };

  // .select() を付けて削除行数を見る。RLS で弾かれた場合 error は null のまま
  // 0行になるので、これが無いと「削除しました」と嘘をつく。
  const { data: deleted, error } = await auth.supabase.from("site_content_posts").delete().eq("id", id).select("id");
  if (error) return { ok: false, error: error.message };
  if (!deleted?.length) return { ok: false, error: "forbidden" };

  revalidatePublicPaths(row.type as SiteContentType);
  return { ok: true, data: null };
}

export async function setSiteContentStatusAction(id: string, status: SiteContentStatus): Promise<ActionResult<null>> {
  const auth = await authorize();
  if (isErr(auth)) return auth;

  const { data: existing } = await auth.supabase
    .from("site_content_posts")
    .select("type, published_at")
    .eq("id", id)
    .maybeSingle();

  if (!existing) return { ok: false, error: "not_found" };

  const published_at =
    status === "published"
      ? ((existing.published_at as string | null) ?? new Date().toISOString())
      : existing.published_at;

  // delete と同じ理由で更新行数を見る。
  const { data: updated, error } = await auth.supabase
    .from("site_content_posts")
    .update({ status, published_at })
    .eq("id", id)
    .select("id");

  if (error) return { ok: false, error: error.message };
  if (!updated?.length) return { ok: false, error: "forbidden" };

  revalidatePublicPaths(existing.type as SiteContentType);
  return { ok: true, data: null };
}
