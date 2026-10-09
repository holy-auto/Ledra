import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

/** `assets` バケットの署名 URL の有効期間（秒）。画面を開いてから見終わるまでの余裕を取る。 */
export const ASSET_URL_TTL_SEC = 3600;

export async function createSignedAssetUrl(path: string, expiresInSeconds = ASSET_URL_TTL_SEC) {
  const supabaseService = createServiceRoleAdmin("signedUrl — assets バケットの署名付きURL発行");
  const { data, error } = await supabaseService.storage.from("assets").createSignedUrl(path, expiresInSeconds);

  if (error) return null;
  return data?.signedUrl ?? null;
}

/**
 * `assets` バケットの複数のパスを、短命の署名 URL にまとめて変換する（1 往復）。 [写真の非公開化 ①②]
 * 保存先を非公開にしても表示が壊れないよう、公開 URL（getPublicUrl）の代わりに使う。
 * **投げない**: 発行に失敗したパスは Map に入らない（呼び出し側は URL 無し＝表示しない、として扱う）。
 */
export async function signAssetPaths(
  db: Pick<SupabaseClient, "storage">,
  paths: Array<string | null | undefined>,
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const unique = [...new Set(paths.filter((p): p is string => !!p))];
  if (unique.length === 0) return out;
  try {
    const { data, error } = await db.storage.from("assets").createSignedUrls(unique, ASSET_URL_TTL_SEC);
    if (error) throw error;
    for (const d of data ?? []) if (d.path && d.signedUrl) out.set(d.path, d.signedUrl);
  } catch (e) {
    logger.warn("[signedUrl] signed url issue failed", {
      err: e instanceof Error ? e.message : String(e),
      count: unique.length,
    });
  }
  return out;
}
