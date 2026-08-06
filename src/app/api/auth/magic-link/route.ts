/**
 * POST /api/auth/magic-link
 *
 * 既存ユーザー向けのパスワードレス（メールリンク / OTP）ログイン開始。
 * Body: { email: string, next?: string }
 *
 * パスワードログイン (src/app/login/page.tsx) と同様に、まず
 * `checkPasswordSignInAllowed` で SSO 必須ドメインを弾く。これをやらないと
 * SAML 必須テナントのユーザーがマジックリンクで SSO を回避できてしまう
 * （ssoPolicy.ts のソフト enforcement を維持するための要）。
 *
 * Response:
 *   200 { ok: true }
 *   403 { error: "sso_required", domain } — SSO 必須ドメイン
 *   400 バリデーションエラー
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { checkPasswordSignInAllowed } from "@/lib/auth/ssoPolicy";
import { resolveBaseUrl } from "@/lib/url";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { apiOk, apiError, apiValidationError, apiInternalError } from "@/lib/api/response";

export const dynamic = "force-dynamic";

const schema = z.object({
  email: z.string().trim().toLowerCase().min(1).email(),
  next: z.string().trim().max(500).optional(),
});

/** 内部相対パスのみ許可（オープンリダイレクト防止） */
function safeNext(value: string | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return "/admin";
  return value;
}

export async function POST(req: NextRequest) {
  const limited = await checkRateLimit(req, "auth");
  if (limited) return limited;

  try {
    const parsed = schema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError("メールアドレスの形式が正しくありません。");
    }
    const { email } = parsed.data;
    const next = safeNext(parsed.data.next);

    // ── SSO 必須ドメインのチェック（パスワード経路と同じ enforcement） ──
    const admin = createServiceRoleAdmin("magic-link — checks sso_required policy before sending OTP");
    const policy = await checkPasswordSignInAllowed(admin, email);
    if (!policy.allowed) {
      return apiError({
        code: "forbidden",
        message: "このメールアドレスは SSO ログインが必須です。",
        status: 403,
        data: { error: "sso_required", domain: policy.tenantSsoDomain },
      });
    }

    // ── マジックリンク送信（新規ユーザーは作成しない） ──
    // PKCE: verifier Cookie を張るのは今このリクエストのオリジン。コールバックも
    // 同一オリジンでないと exchangeCodeForSession が verifier 不一致で失敗するため、
    // APP_URL ではなくリクエストオリジンへ戻す。
    const baseUrl = resolveBaseUrl({ req, preferRequestOrigin: true });
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: false,
        emailRedirectTo: `${baseUrl}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });

    // ユーザーが存在しない等のエラーでも、列挙を避けるため 200 を返す
    // （メールが届かなければユーザーは新規登録に誘導される）。
    if (error) {
      return apiOk({ ok: true });
    }

    return apiOk({ ok: true });
  } catch (e) {
    return apiInternalError(e, "auth/magic-link");
  }
}
