/**
 * 保険会社向け: ブロックチェーン真正性検証API
 *
 * GET /api/insurer/anchor-verify/:sha256
 *
 * 渡された SHA-256 が LedraAnchor コントラクトに記録されているかを
 * オンチェーンで検証し、記録されていれば対応する証明書画像のメタデータを返す。
 *
 * 用途: 保険会社が独立に「この施工写真は改ざんされていないか」を検証
 */
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logInsurerAccess } from "@/lib/insurer/audit";
import { resolveInsurerCaller } from "@/lib/api/insurerAuth";
import { apiInternalError, apiUnauthorized, apiValidationError, apiNotFound, apiOk } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { verifyAnchor, buildExplorerUrl } from "@/lib/anchoring/providers";

export const runtime = "nodejs";

const SHA256_RE = /^(0x)?[a-fA-F0-9]{64}$/;

export async function GET(req: NextRequest, ctx: { params: Promise<{ sha256: string }> }) {
  const caller = await resolveInsurerCaller();
  if (!caller) return apiUnauthorized();

  const limited = await checkRateLimit(req, "general");
  if (limited) return limited;

  const { sha256: rawSha } = await ctx.params;
  if (!SHA256_RE.test(rawSha)) {
    return apiValidationError("SHA-256 ハッシュの形式が不正です。64桁のhex文字列を指定してください。");
  }

  const sha256 = rawSha.replace(/^0x/, "").toLowerCase();

  const sb = await createClient();

  // DB 上のメタデータを取得
  const { data: image, error } = await sb
    .from("certificate_images")
    .select(
      "id, certificate_id, sha256, authenticity_grade, polygon_tx_hash, polygon_network, c2pa_verified, exif_captured_at, exif_device_model, created_at, certificates!inner(tenant_id, public_id, status)",
    )
    .eq("sha256", sha256)
    .limit(1)
    .maybeSingle<{
      id: string;
      certificate_id: string;
      sha256: string | null;
      authenticity_grade: string | null;
      polygon_tx_hash: string | null;
      polygon_network: "polygon" | "amoy" | null;
      c2pa_verified: boolean | null;
      exif_captured_at: string | null;
      exif_device_model: string | null;
      created_at: string | null;
      certificates: { tenant_id: string; public_id: string; status: string } | null;
    }>();

  if (error) return apiInternalError(error, "insurer.anchor-verify.[sha256]");
  if (!image) return apiNotFound("該当する施工画像が見つかりません。");

  // 保険会社が契約している施工店の証明書のみ開示可能
  const cert = image.certificates;
  if (!cert) return apiNotFound("証明書が取得できません。");
  const { data: contract } = await sb
    .from("insurer_tenant_contracts")
    .select("id")
    .eq("insurer_id", caller.insurerId)
    .eq("tenant_id", cert.tenant_id)
    .eq("status", "active")
    .maybeSingle();

  if (!contract) {
    return apiNotFound("該当する施工画像が見つかりません。");
  }

  const network =
    image.polygon_network === "amoy" || image.polygon_network === "polygon"
      ? (image.polygon_network as "amoy" | "polygon")
      : null;

  // オンチェーン検証（読み取り専用、ガス代なし）
  // 画像が記録されたネットワーク (polygon_network) で検証する — ランタイム設定が
  // メインネットに移行した後でも過去の Amoy アンカーを正しく確認するため。
  let onChainVerified = false;
  try {
    onChainVerified = await verifyAnchor(sha256, network);
  } catch (err) {
    console.warn("[anchor-verify] on-chain check failed:", err);
  }

  // 監査ログ
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const ua = req.headers.get("user-agent") ?? null;
  try {
    await logInsurerAccess({
      action: "view",
      certificateId: image.certificate_id,
      meta: {
        route: "GET /api/insurer/anchor-verify/[sha256]",
        sha256_prefix: sha256.slice(0, 12),
        on_chain_verified: onChainVerified,
      },
      ip,
      userAgent: ua,
    });
  } catch {
    // 監査ログ失敗は検証をブロックしない
  }

  return apiOk({
    sha256,
    onChainVerified,
    authenticity_grade: image.authenticity_grade,
    polygon_tx_hash: image.polygon_tx_hash ?? null,
    polygon_network: network,
    explorer_url: buildExplorerUrl(image.polygon_tx_hash, network),
    c2pa_verified: image.c2pa_verified,
    captured_at: image.exif_captured_at,
    device_model: image.exif_device_model,
    certificate_public_id: cert.public_id,
    certificate_status: cert.status,
    image_created_at: image.created_at,
  });
}
