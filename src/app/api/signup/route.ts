import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { signupSchema } from "@/lib/validations/signup";
import { apiOk, apiError, apiInternalError, apiValidationError } from "@/lib/api/response";

export const dynamic = "force-dynamic";

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** slug生成: 店舗名からURL-safeなslugを作成 */
function generateSlug(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^\w\u3000-\u9fff\uff00-\uffef]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${base}-${suffix}`;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));

    // ── Zodバリデーション ──
    const parsed = signupSchema.safeParse(body);
    if (!parsed.success) {
      const messages = parsed.error.issues.map((i) => i.message);
      return apiValidationError(messages.join(" "), { messages });
    }

    const { email, password, shop_name, display_name, contact_phone } = parsed.data;
    const admin = getSupabaseAdmin();

    // ── 1) Supabase Auth ユーザー作成 ──
    const { data: authData, error: authError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { display_name: display_name || shop_name },
    });

    if (authError) {
      if (authError.message?.includes("already been registered") || authError.message?.includes("already exists")) {
        return apiError({
          code: "conflict",
          message: "このメールアドレスは既に登録されています。ログインしてください。",
          status: 409,
          data: { messages: ["このメールアドレスは既に登録されています。ログインしてください。"] },
        });
      }
      return apiInternalError(authError, "signup: auth user creation");
    }

    const userId = authData.user.id;

    // ── 2) テナント（店舗）作成 ──
    const slug = generateSlug(shop_name);
    const { data: tenant, error: tenantError } = await admin
      .from("tenants")
      .insert({
        id: crypto.randomUUID(),
        name: shop_name,
        slug,
        plan_tier: "mini",
        is_active: true,
        contact_email: email,
        contact_phone,
      })
      .select("id")
      .single();

    if (tenantError) {
      console.error("signup: tenant creation failed, rolling back user", tenantError);
      await admin.auth.admin.deleteUser(userId);
      return apiInternalError(tenantError, "signup: tenant creation");
    }

    // ── 3) テナントメンバーシップ作成（owner ロール） ──
    const { error: membershipError } = await admin
      .from("tenant_memberships")
      .insert({
        id: crypto.randomUUID(),
        tenant_id: tenant.id,
        user_id: userId,
        role: "owner",
      });

    if (membershipError) {
      console.error("signup: membership creation failed, rolling back", membershipError);
      await admin.from("tenants").delete().eq("id", tenant.id);
      await admin.auth.admin.deleteUser(userId);
      return apiInternalError(membershipError, "signup: membership creation");
    }

    return apiOk({
      user_id: userId,
      tenant_id: tenant.id,
      email,
      shop_name,
    }, 201);
  } catch (e) {
    return apiInternalError(e, "signup");
  }
}
