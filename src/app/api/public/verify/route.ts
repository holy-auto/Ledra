/**
 * 公開ブロックチェーン検証 API
 *
 * POST /api/public/verify
 * body: { sha256: string }
 *
 * 誰でも叩ける公開エンドポイント。画像の SHA-256 を渡すと、その画像が
 * Ledra 経由で発行された証明書に紐付いているかをオンチェーンで検証し、
 * 個人情報を含まない最小限のメタデータを返す。
 *
 * 用途:
 *   - 顧客が自分のスマホで撮った画像のハッシュが、実際に発行された証明書と
 *     一致するかをブラウザ上で独立検証できる
 *   - 第三者 (例: 将来の買取店・整備工場) が施工の真正性を確認できる
 *
 * セキュリティ:
 *   - 氏名・電話・車両 ID・tenant_id などの PII / 内部 ID は一切返さない
 *   - 店舗名は公開してよいブランド情報なので返す
 *   - 存在しないハッシュは 404 ではなく 200 + { onChainVerified: false } で返す
 *     (存在判定から DB の構造を推測されないため)
 *   - レート制限は `general` プリセット (60 req / 60s / IP)
 */
import type { NextRequest } from "next/server";
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { apiOk, apiValidationError, apiInternalError } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { verifyAnchor, buildExplorerUrl } from "@/lib/anchoring/providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SHA256_RE = /^(0x)?[a-fA-F0-9]{64}$/;

type PublicVerifyResponse = {
  sha256: string;
  onChainVerified: boolean;
  anchored: boolean;
  polygonTxHash: string | null;
  polygonNetwork: "polygon" | "amoy" | null;
  explorerUrl: string | null;
  authenticityGrade: string | null;
  c2paVerified: boolean | null;
  capturedAt: string | null;
  deviceModel: string | null;
  imageCreatedAt: string | null;
  certificatePublicId: string | null;
  certificateStatus: string | null;
  shopName: string | null;
};

function emptyResult(sha256: string): PublicVerifyResponse {
  return {
    sha256,
    onChainVerified: false,
    anchored: false,
    polygonTxHash: null,
    polygonNetwork: null,
    explorerUrl: null,
    authenticityGrade: null,
    c2paVerified: null,
    capturedAt: null,
    deviceModel: null,
    imageCreatedAt: null,
    certificatePublicId: null,
    certificateStatus: null,
    shopName: null,
  };
}

export async function POST(req: NextRequest) {
  try {
    const limited = await checkRateLimit(req, "general");
    if (limited) return limited;

    const body = await req.json().catch(() => ({}));
    const rawSha = String(body?.sha256 ?? "").trim();

    if (!SHA256_RE.test(rawSha)) {
      return apiValidationError(
        "SHA-256 ハッシュの形式が不正です。64 桁の16進文字列を指定してください。",
      );
    }

    const sha256 = rawSha.replace(/^0x/, "").toLowerCase();

    // DB から最小限のメタデータを取得 (全テナント横断。この sha256 に一致する
    // 画像が 1 件でもあれば、発行元店舗は公開してよい情報として返す)
    const admin = createServiceRoleAdmin("public verify — anonymous SHA-256 lookup spans every tenant");
    const { data: image, error: fetchErr } = await admin
      .from("certificate_images")
      .select(
        "sha256, authenticity_grade, polygon_tx_hash, polygon_network, c2pa_verified, exif_captured_at, exif_device_model, created_at, certificates!inner(public_id, status, tenants!inner(name))",
      )
      .eq("sha256", sha256)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (fetchErr) {
      console.warn("[public/verify] DB lookup error:", fetchErr.message);
    }

    // 画像が見つかっていれば、その画像が記録されたネットワークで検証する
    // (メインネットに移行したあとも、過去に Amoy へ刻まれた画像を正しく検証するため)
    const rowNetwork =
      image?.polygon_network === "amoy" || image?.polygon_network === "polygon"
        ? (image.polygon_network as "amoy" | "polygon")
        : null;

    // オンチェーン検証 (ガス代不要の read-only call)
    let onChainVerified = false;
    try {
      onChainVerified = await verifyAnchor(sha256, rowNetwork);
    } catch (err) {
      console.warn("[public/verify] on-chain check failed:", err);
    }

    if (!image) {
      // DB に記録がない → ただし onChainVerified は true の可能性がある
      // (他の Ledra インスタンスや古いバックアップ経由など)
      return apiOk({
        ...emptyResult(sha256),
        onChainVerified,
      });
    }

    const network = rowNetwork;

    // Supabase の型推論は join されたリレーションを配列にしがちなので手動キャスト
    const cert = (image as unknown as {
      certificates: {
        public_id: string | null;
        status: string | null;
        tenants: { name: string | null } | null;
      } | null;
    }).certificates;

    const shopName = cert?.tenants?.name ?? null;

    const response: PublicVerifyResponse = {
      sha256,
      onChainVerified,
      anchored: Boolean(image.polygon_tx_hash),
      polygonTxHash: image.polygon_tx_hash ?? null,
      polygonNetwork: network,
      explorerUrl: buildExplorerUrl(image.polygon_tx_hash, network),
      authenticityGrade: image.authenticity_grade ?? null,
      c2paVerified: typeof image.c2pa_verified === "boolean" ? image.c2pa_verified : null,
      capturedAt: image.exif_captured_at ?? null,
      deviceModel: image.exif_device_model ?? null,
      imageCreatedAt: image.created_at ?? null,
      certificatePublicId: cert?.public_id ?? null,
      certificateStatus: cert?.status ?? null,
      shopName,
    };

    return apiOk(response);
  } catch (e) {
    return apiInternalError(e, "public/verify");
  }
}
