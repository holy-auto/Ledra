/**
 * 装着エビデンス写真の取り込みサービス（現場タブレットの「撮るだけ」経路の中核）。
 *
 * 設計: docs/parts-installation-integrity-design.md（証拠の真正性 L2 / 使い回し検知 L7）
 *
 * 既存の作成 API (`POST /api/parts/installations`) は「アップロード済みの写真メタ
 * (storage_path / sha256 / perceptual_hash / exif_captured_at)」を前提にしていたが、
 * 実際に写真を撮影→アップロードしてハッシュ・EXIF を付与する経路は納品書用しか
 * 無かった。本サービスはその欠落を埋め、装着写真について以下をサーバ側で行う:
 *
 *  1. SHA-256（バイト改ざん検知。クライアント送信値は信用しない）。
 *  2. 知覚ハッシュ（aHash。再圧縮・微編集に耐え、使い回しを検出）。
 *  3. EXIF 撮影日時 (DateTimeOriginal) を抽出し、EXIF の有無で真正性グレードを付与。
 *  4. 同テナント他装着との sha256 / 知覚ハッシュ重複を検知し photo_duplicate finding を記録。
 *  5. assets バケットへ保存し part_installation_evidence に追記。
 *
 * 確定署名・アンカー・在庫計上には関与しない（人の操作のまま）。
 */

import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { CERTIFICATE_IMAGE_BUCKET } from "@/lib/certificateImages"; // 共有 "assets" バケット
import { hashSha256, computePerceptualHash } from "@/lib/anchoring/imageHashing";
import { extractExifMeta } from "@/lib/ai/photoTamperingCheck";
import { findDuplicateEvidence } from "@/lib/parts/installationService";

type Admin = ReturnType<typeof createTenantScopedAdmin>["admin"];

/** 装着写真として撮影・アップロードできる kind（納品書は専用経路を持つので除く）。 */
export const INSTALL_PHOTO_KINDS = [
  "install_photo",
  "context_photo",
  "old_part_photo",
  "removed_part",
  "seal",
  "marking",
] as const;
export type InstallPhotoKind = (typeof INSTALL_PHOTO_KINDS)[number];

export interface AttachPhotoResult {
  evidence_id: string;
  sha256: string;
  perceptual_hash: string;
  exif_captured_at: string | null;
  authenticity_grade: "unverified" | "basic";
  duplicate: boolean;
}

/**
 * 装着レコードに写真エビデンスを 1 枚取り込む。
 * 呼び出し側で装着の自テナント所有・追記可否 (status) を確認済みであること。
 */
export async function attachInstallationPhoto(opts: {
  admin: Admin;
  tenantId: string;
  installationId: string;
  kind: InstallPhotoKind;
  buffer: Buffer;
  arrayBuffer: ArrayBuffer;
  mime: string;
  captureNonce?: string | null;
}): Promise<AttachPhotoResult> {
  const { admin, tenantId, installationId, kind, buffer, arrayBuffer, mime } = opts;

  // 1) ハッシュ・EXIF（クライアント値は信用せずサーバ側で算出）。
  const sha256 = hashSha256(buffer);
  const perceptualHash = await computePerceptualHash(buffer);
  const exif = await extractExifMeta(arrayBuffer);
  const exifCapturedAt = exif.takenAt ? new Date(exif.takenAt).toISOString() : null;
  // EXIF があれば最低限「撮影されたメタを伴う」basic、無ければ unverified。
  const authenticityGrade: "unverified" | "basic" = exif.hasExif ? "basic" : "unverified";

  // 2) 保存（assets バケット）。
  const ext = mime.split("/")[1]?.replace("jpeg", "jpg") ?? "jpg";
  const storagePath = `parts/${tenantId}/${installationId}/evidence-${kind}-${Date.now()}.${ext}`;
  const { error: upErr } = await admin.storage
    .from(CERTIFICATE_IMAGE_BUCKET)
    .upload(storagePath, buffer, { contentType: mime, upsert: false });
  if (upErr) throw new Error(`storage upload failed: ${upErr.message}`);

  // 3) 使い回し検知（他装着と sha256 / 知覚ハッシュが一致）。
  const dups = await findDuplicateEvidence(admin, tenantId, installationId, [sha256], [perceptualHash]);

  // 4) エビデンス追記。
  const { data: evidence, error: evErr } = await admin
    .from("part_installation_evidence")
    .insert({
      tenant_id: tenantId,
      installation_id: installationId,
      kind,
      storage_path: storagePath,
      content_type: mime,
      sha256,
      perceptual_hash: perceptualHash,
      authenticity_grade: authenticityGrade,
      exif_captured_at: exifCapturedAt,
      capture_nonce: opts.captureNonce ?? null,
    })
    .select("id")
    .single();
  if (evErr) {
    // 証拠行が作れなければアップロード済みオブジェクトを掃除（孤児防止）。
    admin.storage
      .from(CERTIFICATE_IMAGE_BUCKET)
      .remove([storagePath])
      .catch(() => {});
    throw new Error(`evidence insert failed: ${evErr.message}`);
  }

  // 5) 使い回しが見つかれば critical finding を記録（撮影時点で可視化）。
  if (dups.length > 0) {
    await admin.from("part_integrity_findings").insert({
      tenant_id: tenantId,
      installation_id: installationId,
      rule: "photo_duplicate",
      severity: "critical",
      detail: { matches: dups, note: "他の装着と同一の写真（使い回し疑い）" },
    });
  }

  return {
    evidence_id: evidence.id as string,
    sha256,
    perceptual_hash: perceptualHash,
    exif_captured_at: exifCapturedAt,
    authenticity_grade: authenticityGrade,
    duplicate: dups.length > 0,
  };
}
