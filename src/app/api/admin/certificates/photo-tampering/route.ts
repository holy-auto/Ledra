import { NextRequest } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import { apiJson, apiUnauthorized, apiValidationError, apiInternalError, apiForbidden } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { aggregateCertificateImageIntegrity, type CertImageIntegrityInput } from "@/lib/ai/certificatePhotoIntegrity";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * POST /api/admin/certificates/photo-tampering
 *
 * 証明書写真の改ざんスクリーニングを **オンデマンド** で実行する。
 *
 * Body: JSON { certificate_id: string }
 *
 * 重要: 保存済みの証明書写真はアップロード時に EXIF/GPS を除去・再エンコード済みで
 * （src/lib/anchoring/imageExif.ts）、保存後の画像から EXIF を再解析しても劣化するだけ。
 * そのため本経路は、アップロード時に certificate_images へ確定済みのシグナル
 * （sha256 / perceptual_hash / exif_captured_at / exif_device_model / deepfake_verdict）を
 * 集約する自動スクリーニング (certificatePhotoIntegrity) と **同じ一次判定** を使う。
 * これで自動経路と手動経路の判定基準が一致し、除去済み画像の再 EXIF 解析に依存した
 * 「常に exif_stripped で判定不能」という誤検知が解消される。
 *
 * Vision エスカレーションはアップロード時の自動スクリーニング (photoTamperingAuto) が
 * 担うため、本オンデマンド経路は追加課金なしの決定的な一次判定のみを返す。
 */
export async function POST(req: NextRequest) {
  const limited = await checkRateLimit(req, "ai");
  if (limited) return limited;

  const supabase = await createSupabaseServerClient();
  const caller = await resolveCallerWithRole(supabase);
  if (!caller) return apiUnauthorized();
  // AI 呼び出しは staff 以上 (代表判断 2026-09-01。閲覧専用ロールに費用の出る操作をさせない)
  if (!requireMinRole(caller, "staff")) return apiForbidden();

  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return apiValidationError("Content-Type は application/json を使用してください");
  }

  const body = await req.json().catch(() => ({}));
  const certificateId: string | null = typeof body.certificate_id === "string" ? body.certificate_id : null;
  if (!certificateId) {
    return apiValidationError("certificate_id が必要です");
  }

  try {
    const { admin } = createTenantScopedAdmin(caller.tenantId);

    // certificate 存在確認（テナント越境防止）。
    const { data: cert } = await admin
      .from("certificates")
      .select("id, meta")
      .eq("id", certificateId)
      .eq("tenant_id", caller.tenantId)
      .maybeSingle();
    if (!cert) return apiValidationError("証明書が見つかりません");

    // アップロード時に確定済みのシグナルだけを読む（画像バイトは取得しない）。
    const { data: rows } = await admin
      .from("certificate_images")
      .select(
        "id, sha256, perceptual_hash, exif_captured_at, exif_device_model, deepfake_verdict, authenticity_grade, c2pa_verified, gps_check_verdict, external_c2pa_present, external_c2pa_verified, created_at",
      )
      .eq("certificate_id", certificateId)
      .eq("tenant_id", caller.tenantId)
      .order("sort_order", { ascending: true });

    const images: CertImageIntegrityInput[] = (rows ?? []).map((r) => ({
      id: r.id as string,
      sha256: (r.sha256 as string | null) ?? null,
      perceptualHash: (r.perceptual_hash as string | null) ?? null,
      capturedAt: (r.exif_captured_at as string | null) ?? null,
      uploadedAt: (r.created_at as string | null) ?? null,
      deviceModel: (r.exif_device_model as string | null) ?? null,
      deepfakeVerdict: (r.deepfake_verdict as string | null) ?? null,
      authenticityGrade: (r.authenticity_grade as string | null) ?? null,
      c2paVerified: (r.c2pa_verified as boolean | null) ?? null,
      gpsCheckVerdict: (r.gps_check_verdict as string | null) ?? null,
      externalC2paPresent: (r.external_c2pa_present as boolean | null) ?? null,
      externalC2paVerified: (r.external_c2pa_verified as boolean | null) ?? null,
    }));

    if (images.length === 0) {
      return apiJson({ any_flagged: false, summary: "写真なし", results: [] });
    }

    // C2PA本番署名を期待する運用のときだけ c2pa_missing を有効化する。
    const c2paExpected = (process.env.C2PA_MODE ?? "disabled") === "production";
    const summary = aggregateCertificateImageIntegrity(images, new Date(), { c2paExpected });

    // per-image をパネル表示用に整形（撮影メタは DB 列由来。GPS/ソフトは除去済みのため無し）。
    const byId = new Map(images.map((im) => [im.id, im]));
    const results = summary.perImage.map((p, index) => {
      const im = byId.get(p.imageId);
      return {
        photo_index: index,
        verdict: p.verdict,
        flags: p.flags,
        taken_at: im?.capturedAt ?? null,
        device: im?.deviceModel ?? null,
        software: null,
        gps: null,
        vision_reason: null,
      };
    });

    // meta.tampering_check を確定判定で更新（既存 meta を保持してマージ）。
    // source:"auto" 相当の決定的判定なので、以後の自動スクリーニングも上書き可能。
    const existingMeta =
      cert.meta && typeof cert.meta === "object" && !Array.isArray(cert.meta)
        ? (cert.meta as Record<string, unknown>)
        : {};
    await admin
      .from("certificates")
      .update({
        meta: {
          ...existingMeta,
          tampering_check: {
            checked_at: new Date().toISOString(),
            source: "auto" as const,
            verdict: summary.verdict,
            any_flagged: summary.anyFlagged,
            summary: summary.summary,
            flagged_count: summary.suspiciousCount,
            image_count: summary.imageCount,
            flags: summary.flags,
            signature: summary.signature,
          },
        },
      })
      .eq("id", certificateId)
      .eq("tenant_id", caller.tenantId)
      .then(() => {});

    return apiJson({ any_flagged: summary.anyFlagged, summary: summary.summary, results });
  } catch (err) {
    return apiInternalError(err, "POST /api/admin/certificates/photo-tampering");
  }
}
