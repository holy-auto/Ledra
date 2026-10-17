/**
 * /api/customer/line-link — 顧客ポータルから自分用の LINE 連携の状態取得 / コード発行。
 *
 * GET  : 現在の連携状態と、店舗が LINE 連携対応かを返す（パネル表示制御用）。
 * POST : 連携コードを発行する。顧客が店舗の LINE 公式アカウントへ送信すると
 *        customers.line_user_id が紐付く（webhook の tryConsumeLineLinkCode）。
 *
 * 店スタッフ用の /api/parts/line-link-codes と同じ仕組みを、顧客ポータル
 * セッションで本人確認して提供する顧客向け入口。
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { cookies } from "next/headers";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { apiJson, apiUnauthorized, apiValidationError, apiInternalError } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { CUSTOMER_COOKIE, getTenantIdBySlug, validateSession } from "@/lib/customerPortalServer";
import { GLOBAL_PORTAL_COOKIE, resolvePortalTenantAccessByGlobalToken } from "@/lib/customerPortalGlobal";
import { generateCustomerLinkCode } from "@/lib/line/linkCode";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const bodySchema = z.object({ tenant_slug: z.string().trim().min(1).max(100) });

/**
 * 連携コード発行先の (tenantId, customerId) をポータルセッションから解決する。
 * どちらのセッションも本人と確定した customer_id を持つので、それだけを使う
 * （別人の顧客行に line_user_id を書き込まないため、メール等で推測して引かない）。
 */
async function resolvePortalCustomer(tenantSlug: string): Promise<{ tenantId: string; customerId: string } | null> {
  const tenantId = await getTenantIdBySlug(tenantSlug);
  if (!tenantId) return null;

  const c = await cookies();
  const tenantToken = c.get(CUSTOMER_COOKIE)?.value ?? "";
  const globalToken = c.get(GLOBAL_PORTAL_COOKIE)?.value ?? "";

  if (tenantToken) {
    const sess = await validateSession(tenantId, tenantToken);
    if (sess) return { tenantId, customerId: sess.customer_id };
  }
  if (globalToken) {
    const access = await resolvePortalTenantAccessByGlobalToken(tenantSlug, globalToken);
    if (access) return { tenantId, customerId: access.customer_id };
  }
  return null;
}

/** テナントの LINE 有効フラグと、この顧客が既に連携済みかを取得する。 */
async function loadStatus(tenantId: string, customerId: string): Promise<{ lineEnabled: boolean; linked: boolean }> {
  const { admin } = createTenantScopedAdmin(tenantId);
  const [{ data: tenant }, { data: cust }] = await Promise.all([
    admin.from("tenants").select("line_enabled").eq("id", tenantId).maybeSingle(),
    admin.from("customers").select("line_user_id").eq("id", customerId).eq("tenant_id", tenantId).maybeSingle(),
  ]);
  return { lineEnabled: Boolean(tenant?.line_enabled), linked: Boolean(cust?.line_user_id) };
}

/** GET /api/customer/line-link?tenant=slug — パネル表示用の連携状態。 */
export async function GET(req: NextRequest) {
  try {
    const tenantSlug = (new URL(req.url).searchParams.get("tenant") ?? "").trim();
    if (!tenantSlug) return apiValidationError("missing tenant");

    const resolved = await resolvePortalCustomer(tenantSlug);
    if (!resolved) return apiUnauthorized();

    const status = await loadStatus(resolved.tenantId, resolved.customerId);
    return apiJson({ ok: true, ...status });
  } catch (e) {
    return apiInternalError(e, "customer/line-link GET");
  }
}

/** POST /api/customer/line-link — 連携コードを発行する。 */
export async function POST(req: NextRequest) {
  // 本人確認済みとはいえコード乱発を防ぐため per-IP のレート制限をかける。
  const limited = await checkRateLimit(req, "auth");
  if (limited) return limited;

  try {
    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return apiValidationError("tenant_slug が不正です。");

    const resolved = await resolvePortalCustomer(parsed.data.tenant_slug);
    if (!resolved) return apiUnauthorized();

    const { lineEnabled, linked } = await loadStatus(resolved.tenantId, resolved.customerId);

    // LINE 未連携のテナントでコードを発行しても無意味なので弾く。
    if (!lineEnabled) {
      return apiJson({ ok: false, message: "この店舗はLINE連携に対応していません。" }, { status: 409 });
    }
    // すでに連携済みなら再発行を弾く（別アカウントへの付け替え防止）。
    if (linked) {
      return apiJson({ ok: false, message: "すでにLINE連携済みです。" }, { status: 409 });
    }

    const { code, expiresAt } = await generateCustomerLinkCode(resolved.tenantId, resolved.customerId, null);
    return apiJson({ ok: true, code, expiresAt }, { status: 201 });
  } catch (e) {
    return apiInternalError(e, "customer/line-link POST");
  }
}
