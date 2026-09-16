
import { z } from "zod";

import { isPlatformAdmin } from "@/lib/auth/platformAdmin";
import { createPlatformScopedAdmin } from "@/lib/supabase/admin";
import { apiJson, apiForbidden, apiValidationError, apiNotFound, apiInternalError } from "@/lib/api/response";

import { withCaller } from "@/lib/api/withCaller";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SERVICE_TYPES = ["coating", "ppf", "maintenance", "body_repair", "general"] as const;

// JSONB schema mirrors src/types/templateOption.ts → TemplateConfig.
// We accept loosely-typed JSON because the client form mirrors the
// existing branded-template editor and the renderer is tolerant of
// missing fields (sane defaults in renderBrandedCertificatePdf).
const configJsonSchema = z
  .record(z.string(), z.unknown())
  .refine((v) => typeof (v as Record<string, unknown>).version === "number", {
    message: "config_json.version は number で指定してください。",
  });

const createSchema = z.object({
  manufacturer_id: z.string().uuid(),
  name: z.string().trim().min(1, "テンプレート名は必須です。").max(120),
  description: z.string().trim().max(2000).optional().or(z.literal("")),
  service_type: z.enum(SERVICE_TYPES).optional(),
  config_json: configJsonSchema,
  layout_key: z.string().trim().max(64).optional(),
  thumbnail_path: z.string().trim().max(512).optional().or(z.literal("")),
  is_active: z.boolean().optional(),
  sort_order: z.number().int().min(0).max(9999).optional(),
});

const patchSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string().trim().min(1).max(120).optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    service_type: z.enum(SERVICE_TYPES).nullable().optional(),
    config_json: configJsonSchema.optional(),
    layout_key: z.string().trim().max(64).optional(),
    thumbnail_path: z.string().trim().max(512).nullable().optional(),
    is_active: z.boolean().optional(),
    sort_order: z.number().int().min(0).max(9999).optional(),
  })
  .refine((d) => Object.keys(d).length > 1, { message: "更新項目がありません。" });

function emptyToNull(v: unknown): unknown {
  if (typeof v !== "string") return v;
  const s = v.trim();
  return s ? s : null;
}

/**
 * GET /api/admin/platform/manufacturers/templates?manufacturer_id=...
 * List templates for a manufacturer.
 */
export const GET = withCaller(
  async (req, { caller }) => {
    if (!isPlatformAdmin(caller)) return apiForbidden();

    const url = new URL(req.url);
    const manufacturerId = url.searchParams.get("manufacturer_id");
    if (!manufacturerId) {
      return apiValidationError("manufacturer_id が必要です。");
    }
    const z1 = z.string().uuid().safeParse(manufacturerId);
    if (!z1.success) return apiValidationError("manufacturer_id の形式が不正です。");

    const admin = createPlatformScopedAdmin("admin/manufacturers/templates list — platform directory");
    const { data, error } = await admin
      .from("manufacturer_templates")
      .select("*")
      .eq("manufacturer_id", manufacturerId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) return apiInternalError(error, "manufacturer_templates GET");

    return apiJson({ templates: data ?? [] });
  },
  { routeName: "admin/platform/manufacturers/templates GET" },
);

export const POST = withCaller(
  async (req, { caller }) => {
    if (!isPlatformAdmin(caller)) return apiForbidden();

    const parsed = createSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "入力に誤りがあります。");
    }
    const b = parsed.data;

    const admin = createPlatformScopedAdmin("admin/manufacturers/templates create — platform directory");

    // Confirm parent manufacturer exists; otherwise PostgREST returns a
    // generic FK error. Doing the check here gives a friendlier message
    // and avoids an extra round-trip in the happy path.
    const { data: mfr, error: mfrErr } = await admin
      .from("manufacturers")
      .select("id")
      .eq("id", b.manufacturer_id)
      .maybeSingle();
    if (mfrErr) return apiInternalError(mfrErr, "manufacturer_templates POST parent lookup");
    if (!mfr) return apiNotFound("メーカーが見つかりません。");

    const { data, error } = await admin
      .from("manufacturer_templates")
      .insert({
        manufacturer_id: b.manufacturer_id,
        name: b.name,
        description: emptyToNull(b.description ?? ""),
        service_type: b.service_type ?? null,
        config_json: b.config_json,
        layout_key: b.layout_key ?? "standard",
        thumbnail_path: emptyToNull(b.thumbnail_path ?? ""),
        is_active: b.is_active ?? true,
        sort_order: b.sort_order ?? 0,
      })
      .select("*")
      .single();
    if (error) return apiInternalError(error, "manufacturer_templates POST");

    return apiJson({ template: data });
  },
  { routeName: "admin/platform/manufacturers/templates POST" },
);

export const PATCH = withCaller(
  async (req, { caller }) => {
    if (!isPlatformAdmin(caller)) return apiForbidden();

    const parsed = patchSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "入力に誤りがあります。");
    }
    const { id, ...rest } = parsed.data;

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const [k, v] of Object.entries(rest)) {
      if (v === undefined) continue;
      if (k === "name" || k === "is_active" || k === "config_json" || k === "sort_order" || k === "layout_key") {
        updates[k] = v;
      } else if (typeof v === "string" || v === null) {
        updates[k] = emptyToNull(v);
      } else {
        updates[k] = v;
      }
    }

    const admin = createPlatformScopedAdmin("admin/manufacturers/templates update — platform directory");
    const { data, error } = await admin.from("manufacturer_templates").update(updates).eq("id", id).select("*").single();
    if (error) {
      if (error.code === "PGRST116") return apiNotFound("テンプレートが見つかりません。");
      return apiInternalError(error, "manufacturer_templates PATCH");
    }

    return apiJson({ template: data });
  },
  { routeName: "admin/platform/manufacturers/templates PATCH" },
);
