/**
 * 部品装着レコードに納品書画像がアップロードされた時点で、AI-OCR で明細化し
 * 装着内容・数量と三方照合 (L3) を、人の操作なしで自動実行する IO 層。
 *
 * 納品書アップロードルート (`/api/parts/installations/[id]/delivery-note` POST) から、
 * レスポンス送出後に `after()` 経由で **fire-and-forget** で呼ばれる。after() は auth
 * セッションが切れているため service-role で読み書きし (tenant_id で明示スコープ)、
 * 絶対に throw しない。
 *
 * 段階:
 *   1. settings をロードし parts.auto_reconcile_delivery_note が opt-in 済みか確認 (既定 OFF)
 *   2. is_active と master switch / 月次コストキャップ (settings.enabled) を確認
 *   3. 対象 evidence (kind=delivery_note) の OCR 結果があればそれを、無ければ
 *      assets バケットから画像を取得して extractDeliveryNote (Vision-OCR) で明細化
 *   4. reconcileInstallation で三方照合し、不一致を part_integrity_findings に記録
 *
 * 壁3 とは無関係: 出力は検知 (findings) の注釈のみで、確定署名・アンカー・在庫計上には
 * 一切関与しない (人の操作のまま)。Vision コストは master switch / 月次コストキャップ /
 * source_policies.identity_documents に従う。
 */
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { CERTIFICATE_IMAGE_BUCKET } from "@/lib/certificateImages"; // 共有 "assets" バケット
import {
  extractDeliveryNote,
  toLineItems,
  type DeliveryNoteExtract,
  type ImageMediaType,
} from "@/lib/ai/deliveryNoteOcr";
import { reconcileInstallation } from "@/lib/parts/reconcileService";
import type { LineItem } from "@/lib/parts/reconciliation";
import { startAiRouteUsage } from "@/lib/ai/recordRouteUsage";
import { logger } from "@/lib/logger";
import { loadAiAutomationSettings, isSourceAllowed } from "./policy";
import { shouldAutoReconcileDeliveryNote } from "./orchestrator";

const RECONCILE_ENDPOINT = "/api/parts/installations/delivery-note#auto-reconcile";

const OCR_MEDIA_TYPES: ReadonlySet<string> = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

export interface MaybeAutoReconcileParams {
  tenantId: string;
  installationId: string;
  /** 今回アップロードされた納品書 evidence の id。 */
  evidenceId: string;
}

/** jsonb の ocr_extracted を DeliveryNoteExtract とみなせるか軽く判定する。 */
function asDeliveryNoteExtract(value: unknown): DeliveryNoteExtract | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as { lines?: unknown };
  if (!Array.isArray(v.lines)) return null;
  return value as DeliveryNoteExtract;
}

/**
 * 指定 evidence (納品書) を OCR して三方照合する。失敗しても投げない。
 */
export async function maybeAutoReconcileDeliveryNote(params: MaybeAutoReconcileParams): Promise<void> {
  const { tenantId, installationId, evidenceId } = params;
  try {
    if (!tenantId || !installationId || !evidenceId) return;

    const settings = await loadAiAutomationSettings(tenantId);
    if (!shouldAutoReconcileDeliveryNote(settings)) return;

    const admin = createServiceRoleAdmin("AI auto reconcile delivery note — upload after() lacks auth session");
    const { data: tenant } = await admin.from("tenants").select("is_active").eq("id", tenantId).single();
    if (!tenant || tenant.is_active === false) return;

    const { data: ev } = await admin
      .from("part_installation_evidence")
      .select("id, kind, storage_path, content_type, ocr_extracted")
      .eq("id", evidenceId)
      .eq("tenant_id", tenantId)
      .eq("installation_id", installationId)
      .maybeSingle();
    if (!ev || ev.kind !== "delivery_note") return;

    // 1) 既に OCR 結果がある (クライアント抽出 / 電子納品) ならそれを使う。
    let deliveryLines: LineItem[] = [];
    const cached = asDeliveryNoteExtract(ev.ocr_extracted);
    if (cached) {
      deliveryLines = toLineItems(cached);
    } else if (ev.storage_path && OCR_MEDIA_TYPES.has(ev.content_type ?? "")) {
      // 2) 画像を assets バケットから取得して Vision-OCR で明細化。
      //    document OCR は identity_documents ソース扱い。OFF なら自動 OCR しない。
      if (!isSourceAllowed(settings, "identity_documents")) return;
      const base64 = await downloadBase64(admin, ev.storage_path);
      if (!base64) return;
      const usage = startAiRouteUsage(RECONCILE_ENDPOINT);
      const extract = await extractDeliveryNote(base64, ev.content_type as ImageMediaType);
      deliveryLines = toLineItems(extract);
      usage.record({ tenantId, outcome: "ok", meta: { auto: true, lines: deliveryLines.length } });
    } else {
      return; // OCR 元が無い
    }

    if (deliveryLines.length === 0) return;

    // 3) 三方照合 (reconcileInstallation が part_integrity_findings に記録する)。
    await reconcileInstallation(tenantId, installationId, deliveryLines);
  } catch (e) {
    logger.warn("[partsReconcileAuto] maybeAutoReconcileDeliveryNote threw", {
      installationId,
      err: e instanceof Error ? e.message : String(e),
    });
  }
}

/** assets バケットから画像を取得し base64 で返す。失敗時は null (OCR をスキップ)。 */
async function downloadBase64(
  admin: ReturnType<typeof createServiceRoleAdmin>,
  storagePath: string,
): Promise<string | null> {
  try {
    const { data, error } = await admin.storage.from(CERTIFICATE_IMAGE_BUCKET).download(storagePath);
    if (error || !data) return null;
    const buf = Buffer.from(await data.arrayBuffer());
    return buf.toString("base64");
  } catch {
    return null;
  }
}
