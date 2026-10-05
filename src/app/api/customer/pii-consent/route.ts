/**
 * /api/customer/pii-consent — 保険会社からの個人情報開示申請に、オーナー本人が同意する。
 *
 * GET  ?tenant=<slug>                         … 本人の証明書に届いている未同意の申請
 * POST { tenant_slug, consent_id }            … 同意を記録する
 *
 * 認証: 顧客ポータルセッションのうち **customer_id が紐づいたもののみ**（/api/customer/profile と同じ線引き）。
 * 詳細は src/lib/insurer/ownerConsent.ts。
 */
import { z } from "zod";
import { cookies } from "next/headers";
import { apiOk, apiUnauthorized, apiValidationError, apiNotFound, apiInternalError } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { CUSTOMER_COOKIE, getTenantIdBySlug, validateSession } from "@/lib/customerPortalServer";
import { listPendingOwnerConsents, recordOwnerConsent } from "@/lib/insurer/ownerConsent";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function resolveCustomer(tenantSlug: string) {
  const tenantId = await getTenantIdBySlug(tenantSlug);
  if (!tenantId) return { error: apiNotFound("unknown tenant") } as const;
  const token = (await cookies()).get(CUSTOMER_COOKIE)?.value ?? "";
  const session = token ? await validateSession(tenantId, token) : null;
  if (!session?.customer_id) return { error: apiUnauthorized() } as const;
  return { tenantId, customerId: session.customer_id } as const;
}

export async function GET(req: Request) {
  const limited = await checkRateLimit(req, "general");
  if (limited) return limited;
  try {
    const slug = (new URL(req.url).searchParams.get("tenant") ?? "").trim();
    if (!slug) return apiValidationError("missing tenant");
    const r = await resolveCustomer(slug);
    if ("error" in r) return r.error;
    return apiOk({ requests: await listPendingOwnerConsents(r.tenantId, r.customerId) });
  } catch (e) {
    return apiInternalError(e, "customer/pii-consent GET");
  }
}

const postSchema = z.object({
  tenant_slug: z.string().trim().min(1).max(100),
  consent_id: z.string().uuid(),
});

export async function POST(req: Request) {
  const limited = await checkRateLimit(req, "sensitive");
  if (limited) return limited;
  try {
    const parsed = postSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return apiValidationError(parsed.error.issues[0]?.message ?? "入力が不正です。");
    const r = await resolveCustomer(parsed.data.tenant_slug);
    if ("error" in r) return r.error;
    const ok = await recordOwnerConsent(r.tenantId, r.customerId, parsed.data.consent_id);
    if (!ok) return apiNotFound("対象の申請が見つからないか、既に処理済みです。");
    return apiOk({ consented: true });
  } catch (e) {
    return apiInternalError(e, "customer/pii-consent POST");
  }
}
