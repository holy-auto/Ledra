/**
 * /api/admin/shop-announcements
 *
 * テナント別の顧客向けお知らせ (shop_announcements) の CRUD。
 * 作成 / 更新時、translation.auto_translate が opt-in のテナントでは
 * title/body を多言語へ自動翻訳する (fire-and-forget)。
 *
 * - GET: 自店のお知らせ一覧 (下書き含む)
 * - POST/PUT/DELETE: admin 以上
 */
import { NextRequest } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import {
  apiJson,
  apiOk,
  apiUnauthorized,
  apiForbidden,
  apiValidationError,
  apiInternalError,
} from "@/lib/api/response";
import { parseJsonBody } from "@/lib/api/parseBody";
import {
  shopAnnouncementCreateSchema,
  shopAnnouncementUpdateSchema,
  shopAnnouncementDeleteSchema,
} from "@/lib/validations/shop-announcement";
import { maybeAutoTranslateShopAnnouncement } from "@/lib/ai/automation/announcementAuto";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const COLS = "id, title, body, published, published_at, translations, translated_at, created_at, updated_at";

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const { admin, tenantId } = createTenantScopedAdmin(caller.tenantId);
    const { data, error } = await admin
      .from("shop_announcements")
      .select(COLS)
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) return apiInternalError(error, "shop-announcements GET");
    return apiJson({ announcements: data ?? [] });
  } catch (e) {
    return apiInternalError(e, "shop-announcements GET");
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "admin")) return apiForbidden("お知らせの作成は管理者のみ可能です。");

    const parsed = await parseJsonBody(req, shopAnnouncementCreateSchema);
    if (!parsed.ok) return parsed.response;

    const { admin, tenantId } = createTenantScopedAdmin(caller.tenantId);
    const published = parsed.data.published ?? false;
    const { data, error } = await admin
      .from("shop_announcements")
      .insert({
        tenant_id: tenantId,
        title: parsed.data.title,
        body: parsed.data.body,
        published,
        published_at: published ? new Date().toISOString() : null,
        created_by: caller.userId,
      })
      .select(COLS)
      .single();
    if (error) return apiInternalError(error, "shop-announcements POST");

    // 自動翻訳 (opt-in のテナントのみ実体が動く)。レスポンスは待たない。
    void maybeAutoTranslateShopAnnouncement({
      tenantId,
      announcementId: data.id as string,
      title: parsed.data.title,
      body: parsed.data.body,
    });

    return apiJson({ announcement: data }, { status: 201 });
  } catch (e) {
    return apiInternalError(e, "shop-announcements POST");
  }
}

export async function PUT(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "admin")) return apiForbidden("お知らせの更新は管理者のみ可能です。");

    const parsed = await parseJsonBody(req, shopAnnouncementUpdateSchema);
    if (!parsed.ok) return parsed.response;
    const { id, title, body, published } = parsed.data;

    const { admin, tenantId } = createTenantScopedAdmin(caller.tenantId);
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (title !== undefined) updates.title = title;
    if (body !== undefined) updates.body = body;
    if (published !== undefined) {
      updates.published = published;
      if (published) updates.published_at = new Date().toISOString();
    }
    // 本文/タイトルが変わったら既存の翻訳は陳腐化するのでクリア (再翻訳されるまで原文表示)。
    const contentChanged = title !== undefined || body !== undefined;
    if (contentChanged) {
      updates.translations = null;
      updates.translated_at = null;
    }

    const { data, error } = await admin
      .from("shop_announcements")
      .update(updates)
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .select(COLS)
      .single();
    if (error) return apiInternalError(error, "shop-announcements PUT");
    if (!data) return apiValidationError("お知らせが見つかりません。");

    if (contentChanged) {
      void maybeAutoTranslateShopAnnouncement({
        tenantId,
        announcementId: id,
        title: (data.title as string) ?? "",
        body: (data.body as string) ?? "",
      });
    }

    return apiOk({ announcement: data });
  } catch (e) {
    return apiInternalError(e, "shop-announcements PUT");
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "admin")) return apiForbidden("お知らせの削除は管理者のみ可能です。");

    const parsed = await parseJsonBody(req, shopAnnouncementDeleteSchema);
    if (!parsed.ok) return parsed.response;

    const { admin, tenantId } = createTenantScopedAdmin(caller.tenantId);
    const { error } = await admin
      .from("shop_announcements")
      .delete()
      .eq("id", parsed.data.id)
      .eq("tenant_id", tenantId);
    if (error) return apiInternalError(error, "shop-announcements DELETE");
    return apiOk({ ok: true, deleted: true });
  } catch (e) {
    return apiInternalError(e, "shop-announcements DELETE");
  }
}
