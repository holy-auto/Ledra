/**
 * backfill-demo-image-placeholders.ts
 *
 * 既存の `certificate_images` のうち storage_path が `demo/LEDRA-DEMO-…` の行に対し、
 * Storage 実ファイル（軽量プレースホルダ JPEG）を配置する。フルデモシード
 * (`setup-demo-tenant.ts`) を再実行せずに、公開ページの Storage 400 だけを解消したい
 * ときに使う。DB は書き換えない（Storage への upsert のみ）。
 *
 * 前提:
 *   - SUPABASE_URL（または NEXT_PUBLIC_SUPABASE_URL）と SUPABASE_SERVICE_ROLE_KEY が env にあること
 *
 * 実行:
 *   npx tsx scripts/backfill-demo-image-placeholders.ts
 *
 * 冪等性:
 *   - upsert: true なので何度実行しても安全（既存オブジェクトは上書き）。
 */
import { createClient } from "@supabase/supabase-js";
import { generateDemoPlaceholderJpeg } from "./demoPlaceholderImage";
// 書き込み先バケットは公開ページの読み取り (publicData.ts の getPublicUrl) と同じ定数。
import { CERTIFICATE_IMAGE_BUCKET } from "../src/lib/certificateImages";

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("❌ SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY が必要です。");
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main(): Promise<void> {
  const { data, error } = await admin
    .from("certificate_images")
    .select("storage_path")
    .like("storage_path", "demo/LEDRA-DEMO-%");
  if (error) throw new Error(`certificate_images の取得に失敗: ${error.message}`);

  const paths = (data ?? []).map((r) => r.storage_path as string).filter(Boolean);
  console.log(`対象パス: ${paths.length} 件（バケット: ${CERTIFICATE_IMAGE_BUCKET}）`);
  if (paths.length === 0) {
    console.log("対象なし。終了。");
    return;
  }

  const placeholder = await generateDemoPlaceholderJpeg();
  const results = await Promise.all(
    paths.map(async (path) => {
      const { error: upErr } = await admin.storage
        .from(CERTIFICATE_IMAGE_BUCKET)
        .upload(path, placeholder, { contentType: "image/jpeg", upsert: true });
      if (upErr) console.warn(`  ⚠️ upload 失敗 (${path}): ${upErr.message}`);
      return !upErr;
    }),
  );
  const uploaded = results.filter(Boolean).length;
  console.log(`✓ ${uploaded}/${paths.length} 件を Storage にアップロード`);

  if (uploaded < paths.length) {
    throw new Error(`${paths.length - uploaded} 件のアップロードに失敗しました（公開ページに 400 が残ります）。`);
  }
}

main().catch((err) => {
  console.error("\n❌ エラー:", err instanceof Error ? err.message : err);
  process.exit(1);
});
