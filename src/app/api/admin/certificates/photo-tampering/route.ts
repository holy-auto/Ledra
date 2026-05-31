import { NextRequest } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { apiJson, apiUnauthorized, apiValidationError, apiInternalError } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { auditPhotoTampering } from "@/lib/ai/photoTamperingCheck";
import { loadAiAutomationSettings } from "@/lib/ai/automation/policy";
import { startAiRouteUsage } from "@/lib/ai/recordRouteUsage";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/admin/certificates/photo-tampering
 *
 * 証明書に添付された写真の改ざん有無を EXIF + Vision ハイブリッドで審査する。
 *
 * Body: multipart/form-data
 *   - certificate_id: string (DB から photo URLs を取得するために使う)
 *
 * または JSON { photo_urls: string[] } で直接 URL を渡すことも可能。
 */
export async function POST(req: NextRequest) {
  const limited = await checkRateLimit(req, "ai");
  if (limited) return limited;

  const supabase = await createSupabaseServerClient();
  const caller = await resolveCallerWithRole(supabase);
  if (!caller) return apiUnauthorized();

  const contentType = req.headers.get("content-type") ?? "";

  let photoUrls: string[] = [];
  let certificateId: string | null = null;

  if (contentType.includes("application/json")) {
    const body = await req.json().catch(() => ({}));
    photoUrls = Array.isArray(body.photo_urls) ? body.photo_urls : [];
    certificateId = body.certificate_id ?? null;
  } else {
    return apiValidationError("Content-Type は application/json を使用してください");
  }

  // certificate_id が渡された場合は DB から photo URLs を補完
  if (certificateId && photoUrls.length === 0) {
    const { admin } = createTenantScopedAdmin(caller.tenantId);
    const { data: cert } = await admin
      .from("certificates")
      .select("photo_urls")
      .eq("id", certificateId)
      .eq("tenant_id", caller.tenantId)
      .maybeSingle();
    if (!cert) return apiValidationError("証明書が見つかりません");
    photoUrls = Array.isArray(cert.photo_urls) ? cert.photo_urls : [];
  }

  if (photoUrls.length === 0) {
    return apiJson({ results: [], anyFlagged: false, summary: "写真なし" });
  }

  if (photoUrls.length > 20) {
    return apiValidationError("一度にチェックできる写真は最大 20 枚です");
  }

  const usage = startAiRouteUsage("/api/admin/certificates/photo-tampering");
  try {
    // AI マスタースイッチ OFF / 月次コストキャップ超過時は Vision (Opus) を呼ばず
    // EXIF 解析だけで判定する (無料の改ざんシグナルは維持しつつ AI 課金を止める)。
    const aiSettings = await loadAiAutomationSettings(caller.tenantId);
    const useVision = aiSettings.enabled;

    // 写真を並列ダウンロード → ArrayBuffer に変換
    const downloads = await Promise.allSettled(
      photoUrls.map(async (url) => {
        const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
        if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
        const buffer = await res.arrayBuffer();
        const contentType = res.headers.get("content-type") ?? "image/jpeg";
        return { buffer, contentType };
      }),
    );

    const photoBuffers = downloads
      .map((r) => (r.status === "fulfilled" ? r.value : null))
      .filter((v): v is { buffer: ArrayBuffer; contentType: string } => v !== null);

    const audit = await auditPhotoTampering(photoBuffers, new Date(), { useVision });

    // 実際に Vision を呼んだ (= トークン捕捉あり) 場合だけ月次キャップに課金される。
    usage.record({
      tenantId: caller.tenantId,
      userId: caller.userId,
      outcome: useVision ? "ok" : "ai_disabled",
      meta: { photos: photoBuffers.length, flagged: audit.anyFlagged, vision: useVision },
    });

    // 監査結果を certificates テーブルの meta に保存 (非同期、失敗しても続ける)
    if (certificateId) {
      const { admin } = createTenantScopedAdmin(caller.tenantId);
      await admin
        .from("certificates")
        .update({
          meta: {
            tampering_check: {
              checked_at: new Date().toISOString(),
              any_flagged: audit.anyFlagged,
              summary: audit.summary,
              flagged_count: audit.results.filter((r) => r.verdict === "suspicious").length,
            },
          },
        })
        .eq("id", certificateId)
        .eq("tenant_id", caller.tenantId)
        .then(() => {});
    }

    return apiJson({
      any_flagged: audit.anyFlagged,
      summary: audit.summary,
      results: audit.results.map((r) => ({
        photo_index: r.photoIndex,
        verdict: r.verdict,
        flags: r.flags,
        taken_at: r.exifMeta.takenAt?.toISOString() ?? null,
        device: r.exifMeta.deviceModel,
        software: r.exifMeta.software,
        gps: r.exifMeta.latitude != null ? { lat: r.exifMeta.latitude, lng: r.exifMeta.longitude } : null,
        vision_reason: r.visionReason,
      })),
    });
  } catch (err) {
    usage.record({ outcome: "error" });
    return apiInternalError(err, "POST /api/admin/certificates/photo-tampering");
  }
}
