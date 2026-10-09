import type { SupabaseClient } from "@supabase/supabase-js";
import { CERTIFICATE_IMAGE_BUCKET } from "./constants";
import { logger } from "@/lib/logger";

/** 施工写真の署名 URL の有効期間（秒）。画面を開いてから見終わるまでの余裕を取る。 */
export const IMAGE_URL_TTL_SEC = 3600;

/**
 * 施工写真の保存パスを、短命の署名 URL にまとめて変換する（1 往復）。 [写真の非公開化 ①]
 * 保存先（assets バケット）を非公開にしても表示が壊れないよう、公開 URL（getPublicUrl）の代わりに使う。
 * 発行に失敗したパスは Map に入らない（呼び出し側は URL 無し＝表示しない、として扱う）。
 */
export async function signImagePaths(
  db: Pick<SupabaseClient, "storage">,
  paths: Array<string | null | undefined>,
): Promise<Map<string, string>> {
  const unique = [...new Set(paths.filter((p): p is string => !!p))];
  if (unique.length === 0) return new Map();
  const { data, error } = await db.storage.from(CERTIFICATE_IMAGE_BUCKET).createSignedUrls(unique, IMAGE_URL_TTL_SEC);
  if (error) {
    logger.warn("[certificateImages] signed url issue failed", { err: error.message, count: unique.length });
    return new Map();
  }
  const out = new Map<string, string>();
  for (const d of data ?? []) if (d.path && d.signedUrl) out.set(d.path, d.signedUrl);
  return out;
}
