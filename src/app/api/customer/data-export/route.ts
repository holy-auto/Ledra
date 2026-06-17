/**
 * GET /api/customer/data-export
 *
 * GDPR / 個人情報保護法対応: 認証済み顧客に紐付く全データを JSON で
 * エクスポートする。出力形式は `application/json` (download として
 * 提供するため Content-Disposition も設定)。
 *
 * 認証: 顧客ポータル session cookie (CUSTOMER_COOKIE) のみ。
 *       admin / agent / insurer は対象外 (それぞれ別の export 経路を
 *       後続フェーズで実装予定)。
 *
 * セキュリティ:
 *   - tenant_id を必ず session cookie 経由で解決し、URL 経由の指定は
 *     受け付けない (cross-tenant export を防止)
 *   - 出力は in-memory (大規模顧客でも 1 MB 未満を想定) — 将来的に
 *     QStash 経由の非同期生成 + 署名付き URL に切り替える
 */
import { cookies } from "next/headers";
import { apiUnauthorized, apiValidationError, apiNotFound, apiInternalError } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rateLimit";
import {
  CUSTOMER_COOKIE,
  getTenantIdBySlug,
  validateSession,
  listCertificatesForCustomer,
  listHistoryForCustomer,
  listReservationsForCustomer,
  getCustomerProfile,
} from "@/lib/customerPortalServer";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    // GDPR エクスポートは PII を一括返却するため、盗まれたセッションでの
    // 連打・情報収集を抑止する（IP 単位の機微フロー上限）。
    const limited = await checkRateLimit(req, "sensitive");
    if (limited) return limited;

    const { searchParams } = new URL(req.url);
    const tenantSlug = (searchParams.get("tenant") ?? "").trim();
    if (!tenantSlug) return apiValidationError("missing tenant");

    const tenantId = await getTenantIdBySlug(tenantSlug);
    if (!tenantId) return apiNotFound("unknown tenant");

    const cookieStore = await cookies();
    const token = cookieStore.get(CUSTOMER_COOKIE)?.value ?? "";
    if (!token) return apiUnauthorized();

    const session = await validateSession(tenantId, token);
    if (!session) return apiUnauthorized();

    const [profile, certificates, history, reservations] = await Promise.all([
      getCustomerProfile(
        tenantId,
        session.phone_last4_hash,
        session.phone_last4 ?? undefined,
        session.email,
        session.customer_id,
      ),
      listCertificatesForCustomer(
        tenantId,
        session.phone_last4_hash,
        session.phone_last4 ?? undefined,
        session.email,
        session.customer_id,
      ),
      listHistoryForCustomer(
        tenantId,
        session.phone_last4_hash,
        session.phone_last4 ?? undefined,
        session.email,
        session.customer_id,
      ),
      listReservationsForCustomer(
        tenantId,
        session.phone_last4_hash,
        session.phone_last4 ?? undefined,
        session.email,
        session.customer_id,
      ),
    ]);

    const generatedAt = new Date().toISOString();
    const filename = `ledra-data-export-${tenantSlug}-${generatedAt.slice(0, 10)}.json`;

    const payload = {
      schema_version: "1.0",
      generated_at: generatedAt,
      tenant: { slug: tenantSlug, id: tenantId },
      profile,
      certificates,
      vehicle_history: history,
      upcoming_reservations: reservations,
      metadata: {
        notice:
          "本データは個人情報保護法および GDPR 第15条 (アクセス権) " +
          "に基づき、ご本人がアクセスできるすべての記録を含みます。" +
          "削除のご要望は施工店までご連絡ください。",
      },
    };

    logger.info("customer data export issued", {
      tenantId,
      customerId: session.customer_id ?? null,
      counts: {
        certificates: Array.isArray(certificates) ? certificates.length : 0,
        history: Array.isArray(history) ? history.length : 0,
        reservations: Array.isArray(reservations) ? reservations.length : 0,
      },
    });

    return new Response(JSON.stringify(payload, null, 2), {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="${filename}"`,
        "cache-control": "private, no-store, max-age=0",
        "x-robots-tag": "noindex, nofollow, noarchive",
      },
    });
  } catch (e: unknown) {
    return apiInternalError(e, "customer/data-export");
  }
}
