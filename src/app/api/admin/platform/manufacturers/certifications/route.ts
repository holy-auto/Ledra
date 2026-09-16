
import { z } from "zod";

import { isPlatformAdmin } from "@/lib/auth/platformAdmin";
import { createPlatformScopedAdmin } from "@/lib/supabase/admin";
import { apiJson, apiForbidden, apiValidationError, apiNotFound, apiInternalError } from "@/lib/api/response";

import { withCaller } from "@/lib/api/withCaller";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const grantSchema = z.object({
  manufacturer_id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
});

const revokeSchema = z.object({
  id: z.string().uuid(),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
});

/**
 * GET /api/admin/platform/manufacturers/certifications?manufacturer_id=...
 * List certifications for a manufacturer with tenant names attached.
 */
export const GET = withCaller(
  async (req, { caller }) => {
    if (!isPlatformAdmin(caller)) return apiForbidden();

    const url = new URL(req.url);
    const manufacturerId = url.searchParams.get("manufacturer_id");
    const includeRevoked = url.searchParams.get("include_revoked") === "1";
    if (!manufacturerId || !z.string().uuid().safeParse(manufacturerId).success) {
      return apiValidationError("manufacturer_id が必要です。");
    }

    const admin = createPlatformScopedAdmin("admin/manufacturers/certifications list — platform directory");

    let query = admin
      .from("manufacturer_certified_tenants")
      .select("*, tenants(id, name, slug)")
      .eq("manufacturer_id", manufacturerId)
      .order("certified_at", { ascending: false });
    if (!includeRevoked) query = query.eq("status", "active");

    const { data, error } = await query;
    if (error) return apiInternalError(error, "certifications GET");

    return apiJson({ certifications: data ?? [] });
  },
  { routeName: "admin/platform/manufacturers/certifications GET" },
);

/**
 * POST /api/admin/platform/manufacturers/certifications
 * Grant (or re-activate) a certification.
 *
 * If a (manufacturer, tenant) row already exists in revoked state,
 * we flip it back to active rather than INSERTing — the unique
 * index would otherwise reject the create.
 */
export const POST = withCaller(
  async (req, { caller }) => {
    if (!isPlatformAdmin(caller)) return apiForbidden();

    const parsed = grantSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "入力に誤りがあります。");
    }
    const { manufacturer_id, tenant_id, notes } = parsed.data;

    const admin = createPlatformScopedAdmin("admin/manufacturers/certifications grant — platform directory");

    const [{ data: mfr }, { data: tenant }] = await Promise.all([
      admin.from("manufacturers").select("id").eq("id", manufacturer_id).maybeSingle(),
      admin.from("tenants").select("id").eq("id", tenant_id).maybeSingle(),
    ]);
    if (!mfr) return apiNotFound("メーカーが見つかりません。");
    if (!tenant) return apiNotFound("テナントが見つかりません。");

    const { data: existing } = await admin
      .from("manufacturer_certified_tenants")
      .select("id, status")
      .eq("manufacturer_id", manufacturer_id)
      .eq("tenant_id", tenant_id)
      .maybeSingle();

    if (existing) {
      if (existing.status === "active") {
        return apiValidationError("このテナントは既に認定されています。");
      }
      const { data, error } = await admin
        .from("manufacturer_certified_tenants")
        .update({
          status: "active",
          notes: notes ? notes : null,
          certified_at: new Date().toISOString(),
          certified_by: caller.userId,
          revoked_at: null,
          revoked_by: null,
        })
        .eq("id", existing.id)
        .select("*")
        .single();
      if (error) return apiInternalError(error, "certifications POST reactivate");
      return apiJson({ certification: data });
    }

    const { data, error } = await admin
      .from("manufacturer_certified_tenants")
      .insert({
        manufacturer_id,
        tenant_id,
        status: "active",
        notes: notes ? notes : null,
        certified_by: caller.userId,
      })
      .select("*")
      .single();
    if (error) return apiInternalError(error, "certifications POST insert");

    return apiJson({ certification: data });
  },
  { routeName: "admin/platform/manufacturers/certifications POST" },
);

/**
 * PATCH /api/admin/platform/manufacturers/certifications
 * Revoke a certification (status: active → revoked).
 */
export const PATCH = withCaller(
  async (req, { caller }) => {
    if (!isPlatformAdmin(caller)) return apiForbidden();

    const parsed = revokeSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "入力に誤りがあります。");
    }
    const { id, notes } = parsed.data;

    const admin = createPlatformScopedAdmin("admin/manufacturers/certifications revoke — platform directory");

    const updates: Record<string, unknown> = {
      status: "revoked",
      revoked_at: new Date().toISOString(),
      revoked_by: caller.userId,
    };
    if (notes) updates.notes = notes;

    const { data, error } = await admin
      .from("manufacturer_certified_tenants")
      .update(updates)
      .eq("id", id)
      .eq("status", "active")
      .select("*")
      .single();
    if (error) {
      if (error.code === "PGRST116") return apiNotFound("有効な認定が見つかりません。");
      return apiInternalError(error, "certifications PATCH revoke");
    }

    return apiJson({ certification: data });
  },
  { routeName: "admin/platform/manufacturers/certifications PATCH" },
);
