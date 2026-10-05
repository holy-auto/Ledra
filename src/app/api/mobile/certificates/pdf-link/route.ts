import { NextRequest } from "next/server";
import { z } from "zod";
import { resolveMobileCaller } from "@/lib/auth/mobileAuth";
import { requireMinRole } from "@/lib/auth/checkRole";
import { checkRateLimit } from "@/lib/api/rateLimit";
import {
  apiJson,
  apiUnauthorized,
  apiForbidden,
  apiValidationError,
  apiNotFound,
  apiInternalError,
} from "@/lib/api/response";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { createStaffPdfToken } from "@/lib/certificates/staffPdfLink";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ public_id: z.string().trim().min(1).max(100) });

/**
 * POST: スタッフ用の公開 PDF 署名を発行する（モバイルアプリ用 Bearer Token 認証）。 [G3/G4]
 *
 * 承諾を撤回した顧客の証明書でも、店舗が書面で渡すために印刷できるようにする（staffPdfLink.ts）。
 * 自テナントの有効な証明書にだけ発行する。
 */
export async function POST(req: NextRequest) {
  try {
    const caller = await resolveMobileCaller(req);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "staff")) return apiForbidden();

    const limited = await checkRateLimit(req, "general", caller.userId);
    if (limited) return limited;

    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return apiValidationError("public_id が必要です。");
    const publicId = parsed.data.public_id;

    const { admin } = createTenantScopedAdmin(caller.tenantId);
    const { data: cert, error } = await admin
      .from("certificates")
      .select("id, status")
      .eq("tenant_id", caller.tenantId)
      .eq("public_id", publicId)
      .maybeSingle();
    if (error) return apiInternalError(error, "mobile pdf-link lookup");
    if (!cert || cert.status !== "active") return apiNotFound("証明書が見つかりません。");

    return apiJson({ token: createStaffPdfToken({ tenantId: caller.tenantId, publicId, userId: caller.userId }) });
  } catch (e) {
    return apiInternalError(e, "mobile pdf-link");
  }
}
