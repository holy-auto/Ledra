"use server";

import { revalidatePath } from "next/cache";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { normalizeRole, hasMinRole } from "@/lib/auth/roles";
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
  const { data: userRes } = await supabase.auth.getUser();
  const userId = userRes.user?.id;
  if (!userId) return { ok: false, error: "unauthorized" };

  const { data: mem } = await supabase
    .from("tenant_memberships")
    .select("tenant_id, role")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();

  const role = normalizeRole(mem?.role);
  if (!hasMinRole(role, "staff")) {
    return { ok: false, error: "forbidden" };
  }

  return {
    supabase,
    userId,
    tenantId: (mem?.tenant_id as string | null) ?? null,
  };
}

function isErr(v: AuthContext | Err): v is Err {
  return (v as Err).ok === false;
}

function revalidatePublicPaths(type: SiteContentType) {
  revalidatePath("/admin/site-content");
  if (type === "blog") revalidatePath("/blog");
  if (type === "news") revalidatePath("/news");
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
    input.status === "published"
      ? input.published_at && input.published_at.length > 0
        ? new Date(input.published_at).toISOString()
        : new Date().toISOString()
      : input.published_at && input.published_at.length > 0
        ? new Date(input.published_at).toISOString()
        : null;

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
      event_start_at: input.event_start_at ? new Date(input.event_start_at).toISOString() : null,
      event_end_at: input.event_end_at ? new Date(input.event_end_at).toISOString() : null,
      location: input.location ?? null,
      online_url: input.online_url ?? null,
      capacity: input.capacity ?? null,
      registration_url: input.registration_url ?? null,
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
    input.published_at && input.published_at.length > 0
      ? new Date(input.published_at).toISOString()
      : input.status === "published"
        ? ((existing.published_at as string | null) ?? new Date().toISOString())
        : null;

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
      event_start_at: input.event_start_at ? new Date(input.event_start_at).toISOString() : null,
      event_end_at: input.event_end_at ? new Date(input.event_end_at).toISOString() : null,
      location: input.location ?? null,
      online_url: input.online_url ?? null,
      capacity: input.capacity ?? null,
      registration_url: input.registration_url ?? null,
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

  const { error } = await auth.supabase.from("site_content_posts").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };

  if (row?.type) revalidatePublicPaths(row.type as SiteContentType);
  else revalidatePath("/admin/site-content");
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

  const { error } = await auth.supabase.from("site_content_posts").update({ status, published_at }).eq("id", id);

  if (error) return { ok: false, error: error.message };

  revalidatePublicPaths(existing.type as SiteContentType);
  return { ok: true, data: null };
}
