
import { z } from "zod";

import { isPlatformAdmin } from "@/lib/auth/platformAdmin";
import { createPlatformScopedAdmin } from "@/lib/supabase/admin";
import { apiJson, apiForbidden, apiValidationError, apiNotFound, apiInternalError } from "@/lib/api/response";

import { withCaller } from "@/lib/api/withCaller";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ROLE_VALUES = ["admin", "viewer"] as const;

const inviteSchema = z.object({
  manufacturer_id: z.string().uuid(),
  email: z.string().trim().email("メールアドレス形式が不正です。").max(254),
  display_name: z.string().trim().max(120).optional().or(z.literal("")),
  role: z.enum(ROLE_VALUES).optional(),
});

const patchSchema = z.object({
  id: z.string().uuid(),
  is_active: z.boolean().optional(),
  role: z.enum(ROLE_VALUES).optional(),
  display_name: z.string().trim().max(120).nullable().optional(),
});

/**
 * GET /api/admin/platform/manufacturers/members?manufacturer_id=...
 * List members for a manufacturer with email lookup from auth.users.
 */
export const GET = withCaller(
  async (req, { caller }) => {
    if (!isPlatformAdmin(caller)) return apiForbidden();

    const url = new URL(req.url);
    const manufacturerId = url.searchParams.get("manufacturer_id");
    if (!manufacturerId || !z.string().uuid().safeParse(manufacturerId).success) {
      return apiValidationError("manufacturer_id が必要です。");
    }

    const admin = createPlatformScopedAdmin("admin/manufacturers/members list — platform directory");

    const { data: members, error } = await admin
      .from("manufacturer_memberships")
      .select("id, user_id, role, display_name, is_active, created_at, updated_at")
      .eq("manufacturer_id", manufacturerId)
      .order("created_at", { ascending: false });
    if (error) return apiInternalError(error, "members GET");

    const userIds = (members ?? []).map((m) => m.user_id as string);
    const emailByUserId = new Map<string, string | null>();
    if (userIds.length > 0) {
      // listUsers() is paged. The expected size here is <100 per
      // manufacturer, so a single page is sufficient. If a manufacturer
      // ever has more, we paginate.
      let page = 1;
      while (true) {
        const { data: pageData } = await admin.auth.admin.listUsers({ page, perPage: 200 });
        if (!pageData?.users?.length) break;
        for (const u of pageData.users) {
          if (userIds.includes(u.id)) emailByUserId.set(u.id, u.email ?? null);
        }
        if (pageData.users.length < 200) break;
        page++;
        if (page > 20) break; // hard cap for safety
      }
    }

    const enriched = (members ?? []).map((m) => ({
      ...m,
      email: emailByUserId.get(m.user_id as string) ?? null,
    }));
    return apiJson({ members: enriched });
  },
  { routeName: "admin/platform/manufacturers/members GET" },
);

/**
 * POST /api/admin/platform/manufacturers/members
 *
 * Invite a メーカー担当者. Tries inviteUserByEmail first; if the email
 * is already registered (different portal), falls back to looking up
 * the existing auth user and creating a membership row only.
 *
 * If a membership already exists in inactive state, this re-activates
 * it instead of erroring.
 */
export const POST = withCaller(
  async (req, { caller }) => {
    if (!isPlatformAdmin(caller)) return apiForbidden();

    const parsed = inviteSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "入力に誤りがあります。");
    }
    const { manufacturer_id, email, display_name, role } = parsed.data;
    const trimmedDisplayName = (display_name ?? "").trim() || null;

    const admin = createPlatformScopedAdmin("admin/manufacturers/members invite — platform directory");

    const { data: mfr } = await admin.from("manufacturers").select("id").eq("id", manufacturer_id).maybeSingle();
    if (!mfr) return apiNotFound("メーカーが見つかりません。");

    const userMeta: Record<string, unknown> = {};
    if (trimmedDisplayName) userMeta.display_name = trimmedDisplayName;
    userMeta.manufacturer_id = manufacturer_id;

    // Send invite email; this also creates an auth.users row.
    const redirectTo =
      (process.env.NEXT_PUBLIC_APP_URL ?? "https://app.ledra.co.jp").replace(/\/$/, "") + "/manufacturer";
    const { data: invited, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, {
      data: userMeta,
      redirectTo,
    });

    let userId: string;
    if (invited?.user) {
      userId = invited.user.id;
    } else if (inviteErr?.message?.toLowerCase().includes("already")) {
      // Existing auth.users record — find by email and just create the
      // membership. Page through to a reasonable cap.
      let found: { id: string } | null = null;
      let page = 1;
      while (!found && page <= 20) {
        const { data: pageData } = await admin.auth.admin.listUsers({ page, perPage: 200 });
        if (!pageData?.users?.length) break;
        const match = pageData.users.find((u) => u.email === email);
        if (match) {
          found = { id: match.id };
          break;
        }
        if (pageData.users.length < 200) break;
        page++;
      }
      if (!found) {
        return apiInternalError(inviteErr ?? new Error("既存ユーザーが見つかりませんでした。"), "members POST lookup");
      }
      userId = found.id;
    } else {
      return apiInternalError(inviteErr ?? new Error("招待に失敗しました。"), "members POST invite");
    }

    // Upsert membership: reactivate if a deactivated row already exists.
    const { data: existing } = await admin
      .from("manufacturer_memberships")
      .select("id, is_active")
      .eq("manufacturer_id", manufacturer_id)
      .eq("user_id", userId)
      .maybeSingle();

    if (existing) {
      if (existing.is_active) {
        return apiValidationError("このユーザーは既にメンバーです。");
      }
      const { data, error } = await admin
        .from("manufacturer_memberships")
        .update({
          is_active: true,
          role: role ?? "viewer",
          display_name: trimmedDisplayName,
          invited_by: caller.userId,
        })
        .eq("id", existing.id)
        .select("*")
        .single();
      if (error) return apiInternalError(error, "members POST reactivate");
      return apiJson({ membership: data });
    }

    const { data, error } = await admin
      .from("manufacturer_memberships")
      .insert({
        manufacturer_id,
        user_id: userId,
        role: role ?? "viewer",
        display_name: trimmedDisplayName,
        invited_by: caller.userId,
        is_active: true,
      })
      .select("*")
      .single();
    if (error) return apiInternalError(error, "members POST insert");

    return apiJson({ membership: data });
  },
  { routeName: "admin/platform/manufacturers/members POST" },
);

/**
 * PATCH /api/admin/platform/manufacturers/members
 * Toggle is_active / change role / update display name. Used by the
 * operator UI to deactivate without deleting (preserves audit trail).
 */
export const PATCH = withCaller(
  async (req, { caller }) => {
    if (!isPlatformAdmin(caller)) return apiForbidden();

    const parsed = patchSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "入力に誤りがあります。");
    }
    const { id, ...rest } = parsed.data;
    if (Object.keys(rest).length === 0) {
      return apiValidationError("更新項目がありません。");
    }

    const admin = createPlatformScopedAdmin("admin/manufacturers/members update — platform directory");

    const { data, error } = await admin
      .from("manufacturer_memberships")
      .update({ ...rest })
      .eq("id", id)
      .select("*")
      .single();
    if (error) {
      if (error.code === "PGRST116") return apiNotFound("メンバーが見つかりません。");
      return apiInternalError(error, "members PATCH");
    }
    return apiJson({ membership: data });
  },
  { routeName: "admin/platform/manufacturers/members PATCH" },
);
