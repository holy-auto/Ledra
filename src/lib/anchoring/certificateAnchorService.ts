/**
 * 証明書レコード（メタデータ）アンカリング — write-path (enqueue) のみ。
 *
 * 設計: docs/anchoring-roadmap.md (Phase 2/3)
 *
 * 画像バイト列のアンカー (src/lib/anchoring/providers/polygon 経由) とは独立した層。
 * こちらの目的は「写真ゼロの証明書でも、証明書メタデータ (発行日・施工内容・有効期限)
 * の存在証明をオンチェーンに残す」こと — anchoring-roadmap が指摘する最大ギャップ。
 *
 * このスライスでは発行 (draft→active) 時に canonical digest を計算し、
 * `certificate_anchors` に status='queued' で積むところまで。実際の Merkle batch
 * 送信 / instant 送信 / 検証 API は後続スライス。よって本モジュールは
 * **挙動を一切変えない追加専用の層**であり、`CERT_RECORD_ANCHOR_ENABLED=false`
 * (既定) のときは完全な no-op。enqueue は決して throw しない (発行を止めない)。
 *
 * canonical digest は PII を含まない (certificateHashing.ts の型がそれを保証する)。
 */

import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { computeCertDigest, type CertificateHashInput } from "./certificateHashing";
import { logger } from "@/lib/logger";

/** 証明書メタデータのアンカー queue を有効化するか。既定 OFF (env オプトイン)。 */
export function isCertRecordAnchorEnabled(): boolean {
  return process.env.CERT_RECORD_ANCHOR_ENABLED === "true";
}

/** loader が SELECT する証明書カラム (PII は最小限・digest 材料のみ)。 */
export interface CertificateAnchorRow {
  public_id: string;
  tenant_id: string;
  created_at: string;
  updated_at: string | null;
  status: string;
  vehicle_info_json: unknown;
  content_free_text: string | null;
  content_preset_json: unknown;
  expiry_type: string | null;
  expiry_value: string | null;
}

export interface EnqueueCertificateAnchorParams {
  tenantId: string;
  certificateId: string;
}

export type EnqueueAnchorResult =
  | { queued: true; digest: string }
  | { queued: false; reason: "disabled" | "not_found" | "unchanged" | "no_table" | "error" };

/** 64桁 hex SHA-256 か。 */
function isSha256Hex(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-fA-F]{64}$/.test(value);
}

/** テーブル / 列が未マイグレーションのときに出るエラーか (段階リリース耐性)。 */
function isMissingTableOrColumn(err: { message?: string; code?: string } | null | undefined): boolean {
  if (!err) return false;
  if (["42P01", "PGRST205", "42703", "PGRST204"].includes(err.code ?? "")) return true;
  const msg = (err.message ?? "").toLowerCase();
  return msg.includes("does not exist") || msg.includes("schema cache");
}

/**
 * 証明書行 + 画像ハッシュ群から canonical digest の入力を組み立てる (純関数)。
 *
 * - `issuedAt` は最初の発行時刻 (created_at)、`versionAt` はこのバージョンの時刻
 *   (updated_at があれば優先 / 無ければ created_at) — 編集ごとに digest が変わり、
 *   内容不変なら同じ digest になる (dedup できる) ようにする。
 * - status は canonical 仕様の許容値にクランプする。
 */
export function buildCertificateHashInput(cert: CertificateAnchorRow, imageSha256s: string[]): CertificateHashInput {
  const status: CertificateHashInput["status"] =
    cert.status === "active" || cert.status === "void" ? cert.status : "draft";
  return {
    publicId: cert.public_id,
    tenantId: cert.tenant_id,
    issuedAt: cert.created_at,
    versionAt: cert.updated_at ?? cert.created_at,
    status,
    vehicleInfo: cert.vehicle_info_json ?? null,
    contentFreeText: cert.content_free_text,
    contentPreset: cert.content_preset_json ?? null,
    expiryType: cert.expiry_type,
    expiryValue: cert.expiry_value,
    imageSha256s,
  };
}

/**
 * 証明書の canonical digest を計算し、`certificate_anchors` に queued 行を積む。
 *
 * 失敗しても投げない (発行の副作用フックから fire-and-forget で呼ばれるため)。
 * 直近の anchor 行と同じ digest なら積まない (内容不変 = no-op)。
 */
export async function enqueueCertificateAnchor(params: EnqueueCertificateAnchorParams): Promise<EnqueueAnchorResult> {
  const { tenantId, certificateId } = params;
  if (!isCertRecordAnchorEnabled()) return { queued: false, reason: "disabled" };
  if (!tenantId || !certificateId) return { queued: false, reason: "not_found" };

  try {
    const { admin } = createTenantScopedAdmin(tenantId);

    const { data: cert, error: certErr } = await admin
      .from("certificates")
      .select(
        "public_id, tenant_id, created_at, updated_at, status, vehicle_info_json, content_free_text, content_preset_json, expiry_type, expiry_value",
      )
      .eq("id", certificateId)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (certErr) {
      if (isMissingTableOrColumn(certErr)) return { queued: false, reason: "no_table" };
      logger.warn("[cert-anchor] certificate load failed", { tenantId, certificateId, err: certErr.message });
      return { queued: false, reason: "error" };
    }
    if (!cert) return { queued: false, reason: "not_found" };

    // 画像ハッシュ (壊れた / NULL の sha256 は弾く — canonical builder が throw しないよう)
    const { data: imgs } = await admin
      .from("certificate_images")
      .select("sha256")
      .eq("certificate_id", certificateId)
      .eq("tenant_id", tenantId);
    const imageSha256s = ((imgs ?? []) as { sha256: unknown }[]).map((r) => r.sha256).filter(isSha256Hex);

    const input = buildCertificateHashInput(cert as CertificateAnchorRow, imageSha256s);
    const { canonical, digest } = computeCertDigest(input);

    // dedup: 直近 anchor が同じ digest なら no-op (内容不変)
    const { data: latest, error: latestErr } = await admin
      .from("certificate_anchors")
      .select("cert_digest")
      .eq("certificate_id", certificateId)
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latestErr) {
      if (isMissingTableOrColumn(latestErr)) return { queued: false, reason: "no_table" };
      logger.warn("[cert-anchor] latest anchor load failed", { tenantId, certificateId, err: latestErr.message });
      return { queued: false, reason: "error" };
    }
    if (latest && (latest as { cert_digest?: string }).cert_digest === digest) {
      return { queued: false, reason: "unchanged" };
    }

    const { error: insErr } = await admin.from("certificate_anchors").insert({
      tenant_id: tenantId,
      certificate_id: certificateId,
      cert_digest: digest,
      canonical_json: canonical,
      schema_version: canonical.schema,
      status: "queued",
      anchor_route: "batch",
    });
    if (insErr) {
      if (isMissingTableOrColumn(insErr)) return { queued: false, reason: "no_table" };
      logger.warn("[cert-anchor] enqueue insert failed", { tenantId, certificateId, err: insErr.message });
      return { queued: false, reason: "error" };
    }

    return { queued: true, digest };
  } catch (e) {
    logger.warn("[cert-anchor] enqueueCertificateAnchor threw", {
      tenantId,
      certificateId,
      err: e instanceof Error ? e.message : String(e),
    });
    return { queued: false, reason: "error" };
  }
}
