
import { z } from "zod";

import { isPlatformAdmin } from "@/lib/auth/platformAdmin";
import { createPlatformScopedAdmin } from "@/lib/supabase/admin";
import { apiJson, apiForbidden, apiValidationError, apiNotFound, apiInternalError } from "@/lib/api/response";
import { escapeIlike } from "@/lib/sanitize";

import { withCaller } from "@/lib/api/withCaller";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Slug shape matches existing tenants/insurers conventions: lowercase
// alphanum + hyphen, no leading/trailing hyphen, 2-64 chars.
const slugRegex = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;

const createSchema = z.object({
  name: z.string().trim().min(1, "メーカー名は必須です。").max(120),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(slugRegex, "slugは英小文字・数字・ハイフンのみ使用できます。")
    .max(64)
    .optional()
    .or(z.literal("")),
  description: z.string().trim().max(2000).optional().or(z.literal("")),
  logo_asset_path: z.string().trim().max(512).optional().or(z.literal("")),
  website_url: z.string().trim().url("URLの形式が不正です。").max(512).optional().or(z.literal("")),
  contact_email: z.string().trim().email("メールアドレス形式が不正です。").max(254).optional().or(z.literal("")),
  contact_phone: z.string().trim().max(40).optional().or(z.literal("")),
  is_active: z.boolean().optional(),
});

const patchSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string().trim().min(1).max(120).optional(),
    slug: z
      .string()
      .trim()
      .toLowerCase()
      .regex(slugRegex, "slugは英小文字・数字・ハイフンのみ使用できます。")
      .max(64)
      .nullable()
      .optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    logo_asset_path: z.string().trim().max(512).nullable().optional(),
    website_url: z.string().trim().url().max(512).nullable().optional(),
    contact_email: z.string().trim().email().max(254).nullable().optional(),
    contact_phone: z.string().trim().max(40).nullable().optional(),
    is_active: z.boolean().optional(),
  })
  .refine((d) => Object.keys(d).length > 1, { message: "更新項目がありません。" });

function emptyToNull<T extends string | undefined | null>(v: T): string | null {
  if (v === undefined) return null;
  if (v === null) return null;
  const s = String(v).trim();
  return s ? s : null;
}

/**
 * GET /api/admin/platform/manufacturers
 * List all manufacturers (platform-admin only). Optional ?q= search by name.
 */
export const GET = withCaller(
  async (req, { caller }) => {
    if (!isPlatformAdmin(caller)) return apiForbidden();

    const url = new URL(req.url);
    const q = url.searchParams.get("q") ?? "";
    const includeInactive = url.searchParams.get("include_inactive") === "1";

    const admin = createPlatformScopedAdmin("admin/manufacturers list — platform directory");
    let query = admin.from("manufacturers").select("*").order("name", { ascending: true });
    if (!includeInactive) query = query.eq("is_active", true);
    if (q) query = query.ilike("name", `%${escapeIlike(q)}%`);

    const { data, error } = await query;
    if (error) return apiInternalError(error, "manufacturers GET");

    return apiJson({ manufacturers: data ?? [] });
  },
  { routeName: "admin/platform/manufacturers GET" },
);

/**
 * POST /api/admin/platform/manufacturers
 * Create a new manufacturer.
 */
export const POST = withCaller(
  async (req, { caller }) => {
    if (!isPlatformAdmin(caller)) return apiForbidden();

    const parsed = createSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "入力に誤りがあります。");
    }
    const b = parsed.data;

    const admin = createPlatformScopedAdmin("admin/manufacturers create — platform directory");
    const { data, error } = await admin
      .from("manufacturers")
      .insert({
        name: b.name,
        slug: emptyToNull(b.slug),
        description: emptyToNull(b.description),
        logo_asset_path: emptyToNull(b.logo_asset_path),
        website_url: emptyToNull(b.website_url),
        contact_email: emptyToNull(b.contact_email),
        contact_phone: emptyToNull(b.contact_phone),
        is_active: b.is_active ?? true,
        created_by: caller.userId,
      })
      .select("*")
      .single();
    if (error) {
      if (error.code === "23505") {
        return apiValidationError("同じslugのメーカーが既に登録されています。");
      }
      return apiInternalError(error, "manufacturers POST");
    }

    return apiJson({ manufacturer: data });
  },
  { routeName: "admin/platform/manufacturers POST" },
);

/**
 * PATCH /api/admin/platform/manufacturers
 * Update a manufacturer.
 */
export const PATCH = withCaller(
  async (req, { caller }) => {
    if (!isPlatformAdmin(caller)) return apiForbidden();

    const parsed = patchSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "入力に誤りがあります。");
    }
    const { id, ...rest } = parsed.data;

    // Convert empty strings to null for nullable text columns. Boolean
    // and required `name` pass through as-is.
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const [k, v] of Object.entries(rest)) {
      if (v === undefined) continue;
      if (k === "is_active" || k === "name") {
        updates[k] = v;
      } else if (typeof v === "string") {
        updates[k] = emptyToNull(v);
      } else {
        updates[k] = v;
      }
    }

    const admin = createPlatformScopedAdmin("admin/manufacturers update — platform directory");
    const { data, error } = await admin.from("manufacturers").update(updates).eq("id", id).select("*").single();
    if (error) {
      if (error.code === "23505") {
        return apiValidationError("同じslugのメーカーが既に登録されています。");
      }
      if (error.code === "PGRST116") return apiNotFound("メーカーが見つかりません。");
      return apiInternalError(error, "manufacturers PATCH");
    }

    return apiJson({ manufacturer: data });
  },
  { routeName: "admin/platform/manufacturers PATCH" },
);
