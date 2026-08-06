import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { randomBytes } from "crypto";
import { signupSchema } from "@/lib/validations/signup";
import { apiOk, apiError, apiInternalError, apiValidationError } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { resolveBaseUrl } from "@/lib/url";
import { notifySlack } from "@/lib/slack";

export const dynamic = "force-dynamic";

/** slug生成: 店舗名からURL-safeなslugを作成 */
function generateSlug(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^\w\u3000-\u9fff\uff00-\uffef]+/g, "-")
    .replace(/^-+|-+$/g, "");
  // Math.random は予測可能 (Mersenne Twister) なので、店舗 slug の suffix
  // を列挙される。crypto-strong な 4 byte (8 hex chars) で十分な分散を確保。
  const suffix = randomBytes(4).toString("hex");
  return `${base}-${suffix}`;
}

export async function POST(req: NextRequest) {
  const limited = await checkRateLimit(req, "auth");
  if (limited) return limited;

  try {
    const body = await req.json().catch(() => ({}));

    // ── Zodバリデーション ──
    const parsed = signupSchema.safeParse(body);
    if (!parsed.success) {
      const messages = parsed.error.issues.map((i) => i.message);
      return apiValidationError(messages.join(" "), { messages });
    }

    const { email, password, passwordless, shop_name, display_name, contact_phone } = parsed.data;
    const admin = createServiceRoleAdmin("signup — creates new tenant + owner user (pre-auth, no scope yet)");

    // ── 1) Supabase Auth ユーザー作成 ──
    // パスワードレス登録ではパスワードを設定せず作成し、後段でメールリンク
    // (signInWithOtp) からログインしてもらう。email_confirm: true なので
    // OTP / マジックリンクでそのままサインインできる。
    const { data: authData, error: authError } = await admin.auth.admin.createUser({
      email,
      ...(passwordless ? {} : { password }),
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
        plan_tier: "free",
        is_active: true,
        contact_email: email,
        contact_phone,
      })
      .select("id")
      .single();

    if (tenantError) {
      const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
      if (deleteError) {
        console.error(
          `signup: tenant creation failed AND rollback failed — orphaned auth user ${userId} (${email}) requires manual cleanup`,
          tenantError,
          deleteError,
        );
      } else {
        console.error("signup: tenant creation failed, rolled back user", tenantError);
      }
      return apiInternalError(tenantError, "signup: tenant creation");
    }

    // ── 3) テナントメンバーシップ作成（owner ロール） ──
    const { error: membershipError } = await admin.from("tenant_memberships").insert({
      id: crypto.randomUUID(),
      tenant_id: tenant.id,
      user_id: userId,
      role: "owner",
    });

    if (membershipError) {
      const { error: tenantDeleteError } = await admin.from("tenants").delete().eq("id", tenant.id);
      const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
      if (tenantDeleteError || deleteError) {
        console.error(
          `signup: membership creation failed AND rollback failed — orphaned tenant ${tenant.id} / auth user ${userId} (${email}) requires manual cleanup`,
          membershipError,
          tenantDeleteError,
          deleteError,
        );
      } else {
        console.error("signup: membership creation failed, rolled back", membershipError);
      }
      return apiInternalError(membershipError, "signup: membership creation");
    }

    // ── パスワードレス登録: マジックリンク送信（作成と一体で原子的に） ──
    // パスワードを持たないアカウントなので、リンク送信に失敗すると本人が
    // 二度とログインできない「孤児テナント」になる。ここで送信まで行い、
    // 失敗時は user/tenant/membership をまとめてロールバックして、再登録
    // 時の「メール重複」エラーで詰まる事態を防ぐ。
    if (passwordless) {
      try {
        // PKCE: verifier Cookie を張ったオリジン（＝今このリクエスト）へ確認リンクを
        // 戻す。別ドメイン（APP_URL）だと Cookie が届かず本人がログインできず、
        // パスワード無しアカウントが孤児化する。
        const baseUrl = resolveBaseUrl({ req, preferRequestOrigin: true });
        const supabase = await createClient();
        const { error: otpError } = await supabase.auth.signInWithOtp({
          email,
          options: {
            shouldCreateUser: false,
            emailRedirectTo: `${baseUrl}/auth/callback?next=/admin`,
          },
        });
        if (otpError) throw otpError;
      } catch (otpErr) {
        const { error: membershipDeleteError } = await admin
          .from("tenant_memberships")
          .delete()
          .eq("tenant_id", tenant.id);
        const { error: tenantDeleteError } = await admin.from("tenants").delete().eq("id", tenant.id);
        const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
        if (membershipDeleteError || tenantDeleteError || deleteError) {
          console.error(
            `signup: magic-link send failed AND rollback failed — orphaned tenant ${tenant.id} / auth user ${userId} (${email}) requires manual cleanup`,
            otpErr,
            membershipDeleteError,
            tenantDeleteError,
            deleteError,
          );
        } else {
          console.error("signup: magic-link send failed, rolled back", otpErr);
        }
        return apiError({
          code: "internal_error",
          message: "確認メールの送信に失敗しました。時間をおいて再度お試しください。",
          status: 502,
          data: { messages: ["確認メールの送信に失敗しました。時間をおいて再度お試しください。"] },
        });
      }
    }

    // ── 紹介リンク (/ref/<code>) 経由のアトリビューション（best-effort） ──
    // /ref ランディングが set した ledra_ref cookie を読み、有効な代理店リンク
    // なら紹介(agent_referrals)を trial で起票してテナントに紐付ける。失敗しても
    // 新規登録自体は止めない。有料化時に webhook が contracted へ自動遷移する。
    try {
      const cookieStore = await cookies();
      const refCode = cookieStore.get("ledra_ref")?.value;
      if (refCode) {
        const { data: link } = await admin
          .from("agent_referral_links")
          .select("agent_id")
          .eq("code", refCode)
          .eq("is_active", true)
          .maybeSingle();

        if (link?.agent_id) {
          await admin.from("agent_referrals").insert({
            agent_id: link.agent_id,
            tenant_id: tenant.id,
            shop_name,
            contact_name: display_name || null,
            contact_email: email,
            contact_phone: contact_phone ?? null,
            status: "trial",
            notes: `紹介リンク ${refCode} 経由で新規登録`,
          });
        }
        cookieStore.delete("ledra_ref");
      }
    } catch (refErr) {
      console.error("[signup] referral attribution failed:", refErr);
    }

    try {
      await notifySlack(process.env.SLACK_SIGNUP_WEBHOOK_URL, {
        text: `:tada: 新規施工店登録: *${shop_name}*`,
        color: "#22c55e",
        fields: [
          { title: "店舗名", value: shop_name, short: true },
          { title: "メール", value: email, short: true },
          ...(display_name ? [{ title: "担当者", value: display_name, short: true }] : []),
          ...(contact_phone ? [{ title: "電話", value: contact_phone, short: true }] : []),
          { title: "プラン", value: "free", short: true },
          { title: "tenant_id", value: tenant.id, short: true },
        ],
      });
    } catch (err) {
      console.error("[signup] slack notify failed:", err);
    }

    return apiOk(
      {
        user_id: userId,
        tenant_id: tenant.id,
        email,
        shop_name,
      },
      201,
    );
  } catch (e) {
    return apiInternalError(e, "signup");
  }
}
