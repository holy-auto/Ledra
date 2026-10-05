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
import { createStaffPdfToken, isStaffPdfLinkEnabled } from "@/lib/certificates/staffPdfLink";
import { logCertificateAction } from "@/lib/audit/certificateLog";

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

    // 署名鍵が無い環境では発行しない（モバイルは署名なしで開く＝承諾のある顧客の PDF だけ出る）。
    if (!isStaffPdfLinkEnabled()) {
      return apiJson(
        { error: "staff_pdf_link_disabled", message: "スタッフ用 PDF リンクは未設定です。" },
        { status: 503 },
      );
    }

    const { admin } = createTenantScopedAdmin(caller.tenantId);
    const { data: cert, error } = await admin
      .from("certificates")
      .select("id, status, vehicle_id")
      .eq("tenant_id", caller.tenantId)
      .eq("public_id", publicId)
      .maybeSingle();
    if (error) return apiInternalError(error, "mobile pdf-link lookup");
    // 公開 PDF 側と同じく大文字小文字を区別しない
    if (!cert || String(cert.status ?? "").toLowerCase() !== "active") return apiNotFound("証明書が見つかりません。");

    const token = createStaffPdfToken({ tenantId: caller.tenantId, publicId });
    // 誰が書面交付用に出力したかを残す（公開 PDF 側の閲覧ログは匿名なので、発行時に記録する）。
    logCertificateAction({
      type: "certificate_pdf_generated",
      tenantId: caller.tenantId,
      publicId,
      certificateId: cert.id as string,
      vehicleId: (cert.vehicle_id as string | null) ?? null,
      userId: caller.userId,
      description: `スタッフ用 PDF リンクを発行（書面交付用・承諾ゲート対象外） / Public ID: ${publicId} / User: ${caller.userId}`,
    });
    return apiJson({ token });
  } catch (e) {
    return apiInternalError(e, "mobile pdf-link");
  }
}
