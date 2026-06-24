/**
 * POST /api/customer/line-link — 顧客ポータルから自分用の LINE 連携コードを発行する。
 *
 * 顧客が自分でコードを取得 → 店舗の LINE 公式アカウントへ送信すると
 * customers.line_user_id が紐付く（webhook の tryConsumeLineLinkCode）。
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

const schema = z.object({ tenant_slug: z.string().trim().min(1).max(100) });

/** 連携コード発行先の (tenantId, customerId) をポータルセッションから解決する。 */
async function resolvePortalCustomer(tenantSlug: string): Promise<{ tenantId: string; customerId: string } | null> {
  const tenantId = await getTenantIdBySlug(tenantSlug);
  if (!tenantId) return null;

  const c = await cookies();
  const tenantToken = c.get(CUSTOMER_COOKIE)?.value ?? "";
  const globalToken = c.get(GLOBAL_PORTAL_COOKIE)?.value ?? "";

  let email = "";
  let phoneLast4 = "";
  let customerId: string | null = null;

  if (tenantToken) {
    const sess = await validateSession(tenantId, tenantToken);
    if (sess) {
      email = sess.email;
      phoneLast4 = sess.phone_last4 ?? "";
      customerId = sess.customer_id ?? null;
    }
  }
  if (!email && !customerId && globalToken) {
    const access = await resolvePortalTenantAccessByGlobalToken(tenantSlug, globalToken);
    if (access) {
      email = access.email;
      phoneLast4 = access.phone_last4 ?? "";
    }
  }

  if (!customerId && !email) return null;

  // セッションに customer_id が baked されていればそれを最優先で使う。
  if (customerId) return { tenantId, customerId };

  // フォールバック: テナント内で email 一致の顧客を引く（複数なら下4桁で絞る）。
  const { admin } = createTenantScopedAdmin(tenantId);
  const { data: rows } = await admin
    .from("customers")
    .select("id, phone")
    .eq("tenant_id", tenantId)
    .ilike("email", email);
  if (!rows || rows.length === 0) return null;

  const digits = (s: string | null) => (s ?? "").replace(/\D/g, "");
  const matched = (phoneLast4 && rows.find((r) => digits(r.phone).endsWith(phoneLast4))) || rows[0];
  if (!matched) return null;
  return { tenantId, customerId: matched.id as string };
}

export async function POST(req: NextRequest) {
  // 本人確認済みとはいえコード乱発を防ぐため per-IP のレート制限をかける。
  const limited = await checkRateLimit(req, "auth");
  if (limited) return limited;

  try {
    const parsed = schema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return apiValidationError("tenant_slug が不正です。");

    const resolved = await resolvePortalCustomer(parsed.data.tenant_slug);
    if (!resolved) return apiUnauthorized();

    // LINE 未連携のテナントでコードを発行しても無意味なので弾く。
    const { admin } = createTenantScopedAdmin(resolved.tenantId);
    const { data: tenant } = await admin
      .from("tenants")
      .select("line_enabled")
      .eq("id", resolved.tenantId)
      .maybeSingle();
    if (!tenant?.line_enabled) {
      return apiJson({ ok: false, message: "この店舗はLINE連携に対応していません。" }, { status: 409 });
    }

    const { code, expiresAt } = await generateCustomerLinkCode(resolved.tenantId, resolved.customerId, null);
    return apiJson({ ok: true, code, expiresAt }, { status: 201 });
  } catch (e) {
    return apiInternalError(e, "customer/line-link POST");
  }
}
