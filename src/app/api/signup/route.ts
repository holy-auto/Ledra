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

/**
 * B-M3 是正 (2026-09-08): 既に登録済みのメールへ再度サインアップが試みられたときの
 * 案内メール。本人以外は結果を判別できないよう、送信失敗を呼び出し元に伝播させない
 * (best-effort)。
 */
async function notifyAlreadyRegistered(email: string, req: NextRequest): Promise<void> {
  const { sendEmail } = await import("@/lib/email/sendEmail");
  const baseUrl = resolveBaseUrl({ req, preferRequestOrigin: true });
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
      <p style="color: #1d1d1f; line-height: 1.6;">
        このメールアドレスで Ledra の新規登録が試みられましたが、既にアカウントが存在するため
        新しい店舗は作成されませんでした。
      </p>
      <p style="color: #1d1d1f; line-height: 1.6;">
        心当たりがある場合は、以下からログインしてください。パスワードをお忘れの場合は
        ログイン画面の「パスワードを忘れた方」からリセットできます。
      </p>
      <p style="margin: 24px 0;">
        <a href="${baseUrl}/login" style="color: #0071e3;">${baseUrl}/login</a>
      </p>
      <p style="color: #86868b; font-size: 13px;">
        心当たりのない場合は、このメールを無視してください。
      </p>
    </div>
  `;
  const result = await sendEmail({ to: email, subject: "【Ledra】このメールアドレスは登録済みです", html });
  if (!result.ok) {
    throw new Error(`email_failed:${result.status ?? "unknown"}`);
  }
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
    // B-H3 是正 (2026-09-08): 以前はパスワード登録時のみ email_confirm: true
    // で作成し、直後にクライアントが signInWithPassword で即ログインしていた。
    // これはメールの所有確認を一切経由しない ── 被害者のメールアドレスで
    // テナント (owner) を作成できてしまう。パスワードレス登録は元々
    // signInWithOtp のクリックを経るため確認済みだったが、パスワード登録
    // だけ迂回できていた。両経路とも email_confirm: false で作成し、
    // 後段で必ず確認メール (マジックリンク) を送ってから本人確認を要求する。
    const { data: authData, error: authError } = await admin.auth.admin.createUser({
      email,
      ...(passwordless ? {} : { password }),
      email_confirm: false,
      user_metadata: { display_name: display_name || shop_name },
    });

    if (authError) {
      if (authError.message?.includes("already been registered") || authError.message?.includes("already exists")) {
        // B-M3 是正 (2026-09-08): 409 で「登録済み」を返すと、任意のメールアドレスを
        // 送るだけで Ledra 利用テナントの存在有無を列挙できる（列挙オラクル）。
        // 未登録時と区別できない 200 を返し、既存の持ち主にだけメールで案内する。
        // フロントは成功レスポンス後に signInWithPassword を試み、攻撃者はパスワードを
        // 知らないため失敗して「確認メールを送信しました」画面に落ちる（B-H3 と同じ経路）。
        // 未登録時 (signInWithOtp 送信) と時間差が出てタイミングで区別できないよう
        // 待ち合わせる (失敗しても成功レスポンスは変えない)。
        await notifyAlreadyRegistered(email, req).catch((e) =>
          console.error("[signup] already-registered notice failed:", e),
        );
        return apiOk({ ok: true });
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

    // ── メール確認リンク送信（作成と一体で原子的に） ──
    // email_confirm: false で作成しているため、パスワード登録・
    // パスワードレス登録のどちらも本人がこのリンクを踏むまでログインできない。
    // 送信に失敗すると本人が永久にログインできない「孤児テナント」になるため、
    // ここで送信まで行い、失敗時は user/tenant/membership をまとめて
    // ロールバックして、再登録時の「メール重複」エラーで詰まる事態を防ぐ。
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
