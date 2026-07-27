/**
 * backfill-certificate-versions.ts
 *
 * ②version-forward Phase 1 の初期データ投入。既発行(status != 'draft')の証明書のうち、
 * まだ certificate_versions を 1 件も持たない(= current_version_id 未設定)行に対し、
 * 現在の内容から v1 スナップショットを 1 件作成し、certificates.current_version_id を張る。
 * ワンショット / idempotent(何度実行しても安全 = 既に版がある行は current_version_id で除外)。
 *
 * 正直な注意: ここで作る v1 の存在証明はあくまで「backfill 実行時点」であり、元の発行時刻の
 * 証明ではない(発行時刻は content 内の自己申告フィールド)。change_reason='backfill' で識別可能。
 *
 * 前提 env(.env.local 等):
 *   - SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL)
 *   - SUPABASE_SERVICE_ROLE_KEY
 *
 * 実行:
 *   npx tsx scripts/backfill-certificate-versions.ts --dry-run
 *   npx tsx scripts/backfill-certificate-versions.ts
 *
 * 完了判定: 再実行して inserted=0。
 */

import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
// canonical/hash と内容フィールド定義を二重実装しない: アプリと同じ関数を使う。
import {
  buildCertificateVersionRow,
  CERT_VERSION_CONTENT_FIELDS,
} from "../src/lib/certificates/certificateVersion";

const ZERO_UUID = "00000000-0000-0000-0000-000000000000";
const PAGE = 300;

const SELECT_COLUMNS = ["id", "tenant_id", "current_version", "status", ...CERT_VERSION_CONTENT_FIELDS].join(", ");

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error("❌ SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY が必要です。");
    process.exit(1);
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  let scanned = 0;
  let inserted = 0;
  let errors = 0;
  // keyset ページング。current_version_id を張った行はフィルタ(is null)から外れ、
  // cursor を id で前進させるので再訪しない。
  let cursor = ZERO_UUID;

  console.info(dryRun ? "🔍 DRY-RUN (DB 書き込みなし)" : "📸 certificate_versions backfill 実行");

  for (;;) {
    const { data: rows, error } = await admin
      .from("certificates")
      .select(SELECT_COLUMNS)
      .is("current_version_id", null)
      .neq("status", "draft") // 既発行のみ(draft は発行前で自由編集のため対象外)
      .gt("id", cursor)
      .order("id", { ascending: true })
      .limit(PAGE);
    if (error) {
      console.error("[backfill] select error:", error.message);
      process.exit(1);
    }
    if (!rows || rows.length === 0) break;

    for (const row of rows as unknown as Array<Record<string, unknown>>) {
      scanned++;
      const certId = row.id as string;
      const tenantId = row.tenant_id as string;
      if (dryRun) {
        inserted++;
        continue;
      }
      const versionRow = buildCertificateVersionRow({
        cert: row,
        certificateId: certId,
        tenantId,
        version: (row.current_version as number) ?? 1,
        createdBy: null,
        changeReason: "backfill",
      });
      const { data: ins, error: insErr } = await admin
        .from("certificate_versions")
        .insert(versionRow)
        .select("id")
        .single();
      if (insErr) {
        // unique(certificate_id, version) 競合(既に版がある)は idempotent にスキップ。
        if (insErr.code === "23505") continue;
        errors++;
        console.error("[backfill] version insert error", { id: certId, error: insErr.message });
        continue;
      }
      const { error: ptrErr } = await admin
        .from("certificates")
        .update({ current_version_id: ins.id })
        .eq("id", certId)
        .is("current_version_id", null); // 競合時の二重更新防止
      if (ptrErr) {
        errors++;
        console.error("[backfill] pointer update error", { id: certId, error: ptrErr.message });
        continue;
      }
      inserted++;
    }
    cursor = (rows[rows.length - 1] as Record<string, unknown>).id as string;
  }

  console.info("\n=== 結果 ===");
  console.table([{ scanned, inserted, errors }]);
  if (errors > 0) {
    console.error(`\n❌ ${errors} 件のエラー。ログを確認してください。`);
    process.exit(1);
  }
  console.info(inserted === 0 ? "\n✅ backfill 済み (inserted=0)。" : "\nℹ️  実行済み。再度叩いて inserted=0 を確認してください。");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error("Fatal:", e);
    process.exit(1);
  });
}
