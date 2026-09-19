/**
 * FT Evidence Storage utilities.
 *
 * 実証テストの証拠ファイルを Supabase Storage の
 * `ft-evidence` バケットにアップロードし、署名付き URL を発行する。
 *
 * パス規約: {manufacturer_id}/{project_id}/{job_id}/{uuid}.{ext}
 * — テナント単位ではなくメーカー→プロジェクト→案件の階層でファイルを整理する。
 */

import { randomUUID } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const BUCKET = "ft-evidence";

/** アップロード結果 */
export type FtEvidenceUploadResult = {
  /** Storage 内のパス (DB の file_path に保存) */
  path: string;
  /** アップロード直後の署名付き URL (60 分) */
  signedUrl: string;
};

/**
 * 証拠ファイルを Storage にアップロードする。
 *
 * @param file       アップロードするバイナリ
 * @param opts.manufacturerId メーカー ID
 * @param opts.projectId      プロジェクト ID
 * @param opts.jobId          案件 ID
 * @param opts.fileName       元ファイル名 (拡張子推定用)
 * @param opts.contentType    MIME タイプ
 * @returns path と signedUrl
 * @throws Error アップロード失敗時
 */
export async function uploadFtEvidence(
  file: Buffer | Uint8Array,
  opts: {
    manufacturerId: string;
    projectId: string;
    jobId: string;
    fileName: string;
    contentType: string;
  },
): Promise<FtEvidenceUploadResult> {
  const admin = getSupabaseAdmin();

  const ext = opts.fileName.includes(".") ? opts.fileName.split(".").pop()!.toLowerCase() : "bin";
  const storagePath = `${opts.manufacturerId}/${opts.projectId}/${opts.jobId}/${randomUUID()}.${ext}`;

  const { error: upErr } = await admin.storage.from(BUCKET).upload(storagePath, file, {
    contentType: opts.contentType,
    upsert: false,
  });
  if (upErr) throw new Error(`ft-evidence upload failed: ${upErr.message}`);

  const { data: urlData, error: urlErr } = await admin.storage.from(BUCKET).createSignedUrl(storagePath, 3600); // 60 min
  if (urlErr) throw new Error(`ft-evidence signedUrl failed: ${urlErr.message}`);

  return { path: storagePath, signedUrl: urlData.signedUrl };
}

/**
 * 既存の証拠ファイルの署名付き URL を発行する。
 *
 * @param path  Storage パス (ft_evidence.file_path)
 * @param expiresIn  有効期間 (秒, デフォルト 3600)
 */
export async function signFtEvidenceUrl(path: string, expiresIn = 3600): Promise<string> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin.storage.from(BUCKET).createSignedUrl(path, expiresIn);
  if (error) throw new Error(`ft-evidence signedUrl failed: ${error.message}`);
  return data.signedUrl;
}
