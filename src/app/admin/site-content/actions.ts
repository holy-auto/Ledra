"use server";

import { revalidatePath } from "next/cache";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { jstLocalInputToUtcIso } from "@/lib/datetime";
import { resolveCallerWithRole, requirePermission } from "@/lib/auth/checkRole";
import {
  parseSiteContentFormData,
  siteContentPostSchema,
  type SiteContentPostInput,
  type SiteContentSite,
  type SiteContentStatus,
  type SiteContentType,
} from "@/lib/validations/site-content-post";
import { removeExternalPost, syncExternalPost } from "@/lib/marketing/externalPublish";
import { isExternalSite } from "@/lib/marketing/externalSites";

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

function revalidatePublicPaths(type: SiteContentType, site: SiteContentSite = "ledra") {
  revalidatePath("/admin/site-content");
  // 外部サイト（holy-inc / MobileWash）の記事は Ledra のページに出ないので、
  // revalidate する公開パスは無い。反映は相手リポジトリへのコミット。
  if (site !== "ledra") return;
  if (type === "blog") revalidatePath("/blog");
  if (type === "news") {
    revalidatePath("/news");
    revalidatePath("/"); // トップの NewsTeaser も更新する
  }
  if (type === "event" || type === "webinar") revalidatePath("/events");
}

/**
 * 外部サイトへ反映する。失敗したら DB を元の状態へ戻す。
 *
 * 「DB は公開済みなのに相手サイトに出ていない」も、その逆の
 * 「DB は下書きなのに相手サイトに出たまま」も残さないため、
 * 公開方向・取り下げ方向のどちらの失敗でも `revertTo` に巻き戻す。
 *
 * ponytail: 戻しは status の単純上書きなので、同時に別の編集が走っていると
 * それを踏む。運営は1人想定。複数人になったら楽観ロック（updated_at 条件）にする。
 */
async function syncExternal(
  auth: AuthContext,
  id: string,
  input: SiteContentPostInput,
  published_at: string | null,
  opts: {
    previous?: { slug: string; type: SiteContentType; published_at: string | null };
    /** 失敗したときに戻す status。create では行ごと消すので渡さない。 */
    revertTo?: SiteContentStatus;
  } = {},
): Promise<Err | null> {
  if (!isExternalSite(input.site)) return null;

  const result = await syncExternalPost(
    {
      site: input.site,
      type: input.type,
      status: input.status,
      slug: input.slug,
      title: input.title,
      title_en: input.title_en ?? null,
      category: input.category ?? null,
      excerpt: input.excerpt ?? null,
      body: input.body ?? "",
      published_at,
    },
    opts.previous,
  );
  if (result.ok) return null;

  if (opts.revertTo && opts.revertTo !== input.status) {
    await auth.supabase.from("site_content_posts").update({ status: opts.revertTo }).eq("id", id);
  }
  return {
    ok: false,
    // 一番ありがちな失敗（トークン未設定・失効）は項目に紐付かないので、本文をそのまま出す
    error: result.message,
    fieldErrors: result.field ? { [result.field]: result.message } : undefined,
  };
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
      site: input.site,
      type: input.type,
      status: input.status,
      slug: input.slug,
      title: input.title,
      title_en: input.title_en ?? null,
      category: input.category ?? null,
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

  const syncErr = await syncExternal(auth, data.id as string, input, published_at);
  if (syncErr) {
    // 作ったばかりの行を残すと、入力を直して再送したときに duplicate_slug になる。
    // フォームの入力はクライアント側に残っているので、行を消して作り直させる。
    await auth.supabase
      .from("site_content_posts")
      .delete()
      .eq("id", data.id as string);
    return syncErr;
  }

  revalidatePublicPaths(input.type, input.site);
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
    .select("id, published_at, site, type, slug, status")
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
      site: input.site,
      type: input.type,
      status: input.status,
      slug: input.slug,
      title: input.title,
      title_en: input.title_en ?? null,
      category: input.category ?? null,
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

  // 置き場所（スラッグ・公開日・種別）が変わったら、前のファイルを消すために渡す
  const previous =
    existing.site === input.site
      ? {
          slug: existing.slug as string,
          type: existing.type as SiteContentType,
          published_at: existing.published_at as string | null,
        }
      : undefined;
  const syncErr = await syncExternal(auth, id, input, published_at, {
    previous,
    revertTo: existing.status as SiteContentStatus,
  });
  if (syncErr) return syncErr;

  // 投稿先を付け替えたときは、元のサイトに出ていた記事を消す
  if (existing.site !== input.site) {
    const removed = await removeExternalPost({
      site: existing.site as string,
      type: existing.type as SiteContentType,
      slug: existing.slug as string,
      title: input.title,
      published_at: existing.published_at as string | null,
    });
    if (!removed.ok) return { ok: false, error: removed.message };
  }

  revalidatePublicPaths(input.type, input.site);
  // 投稿先や種別を変えた場合、元の場所のページも作り直す
  // （Ledra → 外部 に移したのに Ledra の /news に残る、を防ぐ）
  if (existing.site !== input.site || existing.type !== input.type) {
    revalidatePublicPaths(existing.type as SiteContentType, existing.site as SiteContentSite);
  }
  return { ok: true, data: { id: data.id as string, type: data.type as SiteContentType } };
}

export async function deleteSiteContentAction(id: string): Promise<ActionResult<null>> {
  const auth = await authorize();
  if (isErr(auth)) return auth;

  const { data: row } = await auth.supabase
    .from("site_content_posts")
    .select("type, site, slug, title, published_at")
    .eq("id", id)
    .maybeSingle();
  // 他の3アクションと同じく、存在しない id は not_found として返す。
  // これが無いと、二度押しや古いリンクが「権限がありません」に化ける。
  if (!row) return { ok: false, error: "not_found" };

  // 外部サイトのファイルを**先に**消す。DB 行を消したあとに失敗すると、
  // 記事はサイトに出たままなのに管理画面から消す手段が無くなる。
  const removed = await removeExternalPost({
    site: row.site as string,
    type: row.type as SiteContentType,
    slug: row.slug as string,
    title: row.title as string,
    published_at: row.published_at as string | null,
  });
  if (!removed.ok) return { ok: false, error: removed.message };

  // .select() を付けて削除行数を見る。RLS で弾かれた場合 error は null のまま
  // 0行になるので、これが無いと「削除しました」と嘘をつく。
  const { data: deleted, error } = await auth.supabase.from("site_content_posts").delete().eq("id", id).select("id");
  if (error) return { ok: false, error: error.message };
  if (!deleted?.length) return { ok: false, error: "forbidden" };

  revalidatePublicPaths(row.type as SiteContentType, row.site as SiteContentSite);
  return { ok: true, data: null };
}

export async function setSiteContentStatusAction(id: string, status: SiteContentStatus): Promise<ActionResult<null>> {
  const auth = await authorize();
  if (isErr(auth)) return auth;

  const { data: existing } = await auth.supabase
    .from("site_content_posts")
    .select("type, published_at, site, slug, title, title_en, category, excerpt, body, status")
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

  const synced = await syncExternalPost({
    site: existing.site as string,
    type: existing.type as SiteContentType,
    status,
    slug: existing.slug as string,
    title: existing.title as string,
    title_en: existing.title_en as string | null,
    category: existing.category as string | null,
    excerpt: existing.excerpt as string | null,
    body: (existing.body as string | null) ?? "",
    published_at,
  });
  if (!synced.ok) {
    // 一覧からの1クリック操作。公開も取り下げも、失敗したら元の状態に戻す
    // （DB とサイトが食い違ったまま「成功」と言わない）。
    await auth.supabase
      .from("site_content_posts")
      .update({ status: existing.status as SiteContentStatus })
      .eq("id", id);
    return { ok: false, error: synced.message };
  }

  revalidatePublicPaths(existing.type as SiteContentType, existing.site as SiteContentSite);
  return { ok: true, data: null };
}
