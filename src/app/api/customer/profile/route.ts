/**
 * POST /api/customer/profile — 顧客が自分の連絡先を登録・更新する。
 *
 * LINE 連携だけで作られた顧客はメールアドレスを持たず、店からのメール通知が届かず、
 * PC など LINE の無い環境からマイページに入る手段も無い。マイページから本人に
 * 登録してもらうための入口。
 *
 * 認証: 顧客ポータルセッションのうち **customer_id が紐づいたもののみ**。
 * 更新対象の行を一意に決められないセッション (旧 OTP セッション) は拒否する。
 */
import { z } from "zod";
import { cookies } from "next/headers";
import { apiOk, apiUnauthorized, apiValidationError, apiNotFound, apiInternalError } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { CUSTOMER_COOKIE, getTenantIdBySlug, validateSession, normalizeEmail } from "@/lib/customerPortalServer";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const schema = z.object({
  tenant_slug: z.string().trim().min(1).max(100),
  email: z.string().trim().toLowerCase().email("メールアドレスの形式が正しくありません。").max(254).optional(),
  phone: z
    .string()
    .trim()
    .max(20)
    .regex(/^[0-9+\-() ]*$/, "電話番号の形式が正しくありません。")
    .optional(),
});

export async function POST(req: Request) {
  // 連絡先の書き換えは乗っ取りの足がかりになり得るので機微フロー扱い。
  const limited = await checkRateLimit(req, "sensitive");
  if (limited) return limited;

  try {
    const parsed = schema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return apiValidationError(parsed.error.issues[0]?.message ?? "入力が不正です。");

    const { tenant_slug, email, phone } = parsed.data;
    if (!email && !phone) return apiValidationError("登録する項目がありません。");

    const tenantId = await getTenantIdBySlug(tenant_slug);
    if (!tenantId) return apiNotFound("unknown tenant");

    const token = (await cookies()).get(CUSTOMER_COOKIE)?.value ?? "";
    if (!token) return apiUnauthorized();

    const session = await validateSession(tenantId, token);
    // customer_id が無いセッションでは「どの顧客行を更新するか」を安全に決められない。
    if (!session?.customer_id) return apiUnauthorized();
    const customerId = session.customer_id;

    const { admin } = createTenantScopedAdmin(tenantId);

    const { data: current } = await admin
      .from("customers")
      .select("id, email, phone")
      .eq("id", customerId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!current) return apiNotFound("customer not found");

    const patch: Record<string, string> = {};

    // 空欄を埋めるだけ。既に入っている値の変更はここでは受け付けない。
    // 登録済みの email はマイページのログイン identity そのもので、本人確認なしに
    // 差し替えられると乗っ取りの経路になる (変更は店舗経由)。
    if (email && String(current.email ?? "").trim()) {
      return apiValidationError("メールアドレスは登録済みです。変更をご希望の場合は店舗へお問い合わせください。");
    }
    if (phone && String(current.phone ?? "").trim()) {
      return apiValidationError("電話番号は登録済みです。変更をご希望の場合は店舗へお問い合わせください。");
    }

    if (email) {
      const normalized = normalizeEmail(email);
      // 同一テナント内で他の顧客が使っている email は拒否する。マイページのログインは
      // email 一致で顧客を引くため、重複を許すと他人の情報に手が届く経路を作ってしまう。
      // ilike は `_` `%` をワイルドカードとして扱うので、候補を引いたうえで完全一致だけを見る
      // (`a_b@ex.com` が `axb@ex.com` に当たって誤って弾かれるのを防ぐ)。
      const { data: candidates, error: clashErr } = await admin
        .from("customers")
        .select("id, email")
        .eq("tenant_id", tenantId)
        .ilike("email", normalized)
        .neq("id", customerId)
        .limit(20);
      // 重複チェックが失敗したまま書き込むと fail-open になる。確認できないなら書かない。
      if (clashErr) return apiInternalError(clashErr, "customer/profile duplicate check");

      const clash = (candidates ?? []).some((c) => normalizeEmail(String(c.email ?? "")) === normalized);
      if (clash) {
        return apiValidationError(
          "このメールアドレスは既に登録されています。お心当たりが無い場合は店舗へお問い合わせください。",
        );
      }
      patch.email = normalized;
    }

    if (phone) patch.phone = phone;

    const { error } = await admin
      .from("customers")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", customerId)
      .eq("tenant_id", tenantId);
    if (error) return apiInternalError(error, "customer/profile update");

    logger.info("customer self-registered contact details", {
      tenantId,
      customerId,
      // 値そのものは残さない (PII)。何を埋めたかだけ。
      fields: Object.keys(patch),
      hadEmail: !!current.email,
    });

    return apiOk({
      ok: true,
      email: patch.email ?? current.email ?? null,
      phone: patch.phone ?? current.phone ?? null,
    });
  } catch (e) {
    return apiInternalError(e, "customer/profile");
  }
}
