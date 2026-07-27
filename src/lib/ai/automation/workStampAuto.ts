/**
 * 写真打刻 — 施工写真アップロード時に EXIF 撮影時刻から施工日・作業時間を自動推定する IO 層。
 *
 * 写真アップロードルート (`/api/certificates/images/upload` POST) から `after()` 経由で
 * fire-and-forget で呼ばれる。after() は auth 無しなので service-role で読み書きし、
 * 絶対に throw しない。photoStageClassifyAuto.ts と同型だが **LLM を呼ばない**ため無料
 * (プラン/Vision ゲート不要・コスト計上不要)。
 *
 * 段階:
 *   1. settings をロードし photo.auto_work_stamp が opt-in 済みか確認 (既定 OFF)
 *   2. is_active を確認
 *   3. certificate_images.exif_captured_at から施工日 / 作業時間を導出 (純関数 deriveWorkStamp)
 *   4. 提案を certificates.meta.work_stamp に保存 (人が UI で確定する提案のみ)
 *
 * 壁3 とは無関係: フォームへの反映・発行・金額には関与しない、提案の注釈のみ。
 */
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { deriveWorkStamp, type WorkStampSuggestion } from "@/lib/certificates/workStamp";
import { logger } from "@/lib/logger";
import { loadAiAutomationSettings } from "./policy";
import { shouldAutoWorkStamp } from "./orchestrator";

export interface MaybeAutoWorkStampParams {
  tenantId: string;
  certificateId: string;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

type StoredWorkStamp = WorkStampSuggestion & { source: "auto"; at: string };

/** 指定証明書の写真の EXIF から施工日・作業時間を推定し meta に保存する。失敗しても投げない。 */
export async function maybeAutoWorkStampForCertificate(params: MaybeAutoWorkStampParams): Promise<void> {
  const { tenantId, certificateId } = params;
  try {
    if (!tenantId || !certificateId) return;

    const settings = await loadAiAutomationSettings(tenantId);
    if (!shouldAutoWorkStamp(settings)) return;

    const admin = createServiceRoleAdmin("AI auto work-stamp — image upload after() lacks auth session");
    const { data: tenant } = await admin.from("tenants").select("is_active").eq("id", tenantId).single();
    if (!tenant || tenant.is_active === false) return;

    const { data: rows } = await admin
      .from("certificate_images")
      .select("exif_captured_at, stage")
      .eq("certificate_id", certificateId)
      .eq("tenant_id", tenantId);
    if (!rows || rows.length === 0) return;

    // 予約 (案件) が紐づいていれば scheduled_date を「予定施工日」として渡し、
    // アルバムの古い写真 (stale_album) を検出する。取得失敗は無視 (best-effort)。
    let expectedDate: string | null = null;
    try {
      const { data: cert } = await admin
        .from("certificates")
        .select("reservation_id")
        .eq("id", certificateId)
        .eq("tenant_id", tenantId)
        .maybeSingle();
      const reservationId = cert?.reservation_id as string | null | undefined;
      if (reservationId) {
        const { data: rsv } = await admin
          .from("reservations")
          .select("scheduled_date")
          .eq("id", reservationId)
          .maybeSingle();
        // scheduled_date は date 型 ("YYYY-MM-DD") 想定だが、時刻付きで返っても
        // 先頭 10 文字に正規化して stale_album 判定の誤発火を防ぐ。
        expectedDate = ((rsv?.scheduled_date as string | null | undefined) ?? "").slice(0, 10) || null;
      }
    } catch {
      // reservation_id 列が無い / 取得失敗時は stale_album 判定を諦める (提案自体は続行)。
    }

    const suggestion = deriveWorkStamp(
      rows.map((r) => ({
        capturedAt: (r.exif_captured_at as string | null) ?? null,
        stage: (r.stage as string | null) ?? null,
      })),
      { expectedDate },
    );

    // 施工日も作業時間も出せない (EXIF 皆無) なら保存しない (空提案でノイズを増やさない)。
    if (suggestion.workDate === null && suggestion.workMinutes === null) return;

    // 書き込み直前に meta を読み直してマージ (stale な上書きを防ぐ)。
    const { data: fresh } = await admin
      .from("certificates")
      .select("meta")
      .eq("id", certificateId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!fresh) return;
    const freshMeta = asRecord(fresh.meta);
    const stored: StoredWorkStamp = { ...suggestion, source: "auto", at: new Date().toISOString() };

    const { error: upErr } = await admin
      .from("certificates")
      .update({ meta: { ...freshMeta, work_stamp: stored } })
      .eq("id", certificateId)
      .eq("tenant_id", tenantId);
    if (upErr) {
      logger.warn("[workStampAuto] meta update failed", { tenantId, certificateId, err: upErr.message });
    }
  } catch (e) {
    logger.warn("[workStampAuto] maybeAutoWorkStampForCertificate threw", {
      tenantId,
      certificateId,
      err: e instanceof Error ? e.message : String(e),
    });
  }
}
