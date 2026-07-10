/**
 * backfill-certificate-phone-hash.ts
 *
 * #72 (High #10) の前提ステップ。certificates の顧客電話番号 last4 のうち、
 * ハッシュ列 `customer_phone_last4_hash` が未設定 (NULL) かつ平文列
 * `customer_phone_last4` が残っている「旧データ」行に対し、平文からハッシュを
 * 計算して埋める。ワンショット / idempotent (何度実行しても安全)。
 *
 * ⚠️ 実行順序が重要:
 *   本スクリプトを本番で流し切って `updated=0` を確認してから、
 *   「平文書き込み停止 → 平文フォールバック読み取り削除 → 平文列 DROP」の PR を
 *   デプロイすること。順序を誤ると、ハッシュ未設定の旧データ顧客が証明書に
 *   アクセスできなくなる (認証は hash 一致で行うため)。
 *
 * 前提 env (`.env.local` 等):
 *   - SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL)
 *   - SUPABASE_SERVICE_ROLE_KEY
 *   - CUSTOMER_AUTH_PEPPER   (アプリの phoneLast4Hash と同じ pepper。ズレると無効なハッシュを書く)
 *
 * 実行:
 *   npx tsx scripts/backfill-certificate-phone-hash.ts --dry-run
 *   npx tsx scripts/backfill-certificate-phone-hash.ts
 *
 * 完了判定: 再実行して `updated=0`。`skip_invalid` が残る場合は平文が4桁数字で
 * ない不正データなので個別確認 (自動ではハッシュ化しない)。
 */

import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
// recipe を二重定義しない: certificates.customer_phone_last4_hash と同じ関数を使う。
import { phoneLast4Hash } from "../src/lib/customerPortalServer";

export type PlanAction = "hash" | "skip_already" | "skip_no_plaintext" | "skip_invalid";

export interface PhoneRow {
  id: string;
  tenant_id: string;
  customer_phone_last4: string | null;
  customer_phone_last4_hash: string | null;
}

/**
 * 1 行の処理方針を決める純粋関数。ここが誤ると認証データを壊す (既存ハッシュ
 * 上書き・不正値のハッシュ化) ため、hashFn を注入して単体テストで担保する。
 */
export function planPhoneHashBackfill(
  row: Pick<PhoneRow, "tenant_id" | "customer_phone_last4" | "customer_phone_last4_hash">,
  hashFn: (tenantId: string, last4: string) => string,
): { action: PlanAction; hash?: string } {
  if (row.customer_phone_last4_hash) return { action: "skip_already" };
  const raw = (row.customer_phone_last4 ?? "").trim();
  if (!raw) return { action: "skip_no_plaintext" };
  if (!/^\d{4}$/.test(raw)) return { action: "skip_invalid" };
  return { action: "hash", hash: hashFn(row.tenant_id, raw) };
}

const ZERO_UUID = "00000000-0000-0000-0000-000000000000";
const PAGE = 500;

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error("❌ SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY が必要です。");
    process.exit(1);
  }
  if (!process.env.CUSTOMER_AUTH_PEPPER) {
    console.error("❌ CUSTOMER_AUTH_PEPPER が必要です (アプリと同じ pepper)。");
    process.exit(1);
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  let scanned = 0;
  let updated = 0;
  let skipInvalid = 0;
  let errors = 0;
  // keyset ページング。ハッシュ化した行はフィルタ (hash IS NULL) から外れるが、
  // cursor を id で前進させるので再訪しない = 不正行での無限ループも起きない。
  let cursor = ZERO_UUID;

  console.info(dryRun ? "🔍 DRY-RUN (DB 書き込みなし)" : "🔐 backfill 実行");

  for (;;) {
    const { data: rows, error } = await admin
      .from("certificates")
      .select("id, tenant_id, customer_phone_last4, customer_phone_last4_hash")
      .is("customer_phone_last4_hash", null)
      .not("customer_phone_last4", "is", null)
      .gt("id", cursor)
      .order("id", { ascending: true })
      .limit(PAGE);
    if (error) {
      console.error("[backfill] select error:", error.message);
      process.exit(1);
    }
    if (!rows || rows.length === 0) break;

    for (const row of rows as PhoneRow[]) {
      scanned++;
      const plan = planPhoneHashBackfill(row, phoneLast4Hash);
      if (plan.action === "skip_invalid") {
        skipInvalid++;
        console.warn("[backfill] 平文が4桁数字でないためスキップ", { id: row.id });
        continue;
      }
      if (plan.action !== "hash") continue; // skip_already / skip_no_plaintext (フィルタ上は来ないが防御的に)
      if (dryRun) {
        updated++;
        continue;
      }
      const { error: upErr } = await admin
        .from("certificates")
        .update({ customer_phone_last4_hash: plan.hash })
        .eq("id", row.id)
        .is("customer_phone_last4_hash", null); // 競合時の二重書き込み防止
      if (upErr) {
        errors++;
        console.error("[backfill] update error", { id: row.id, error: upErr.message });
        continue;
      }
      updated++;
    }
    cursor = (rows[rows.length - 1] as PhoneRow).id;
  }

  console.info("\n=== 結果 ===");
  console.table([{ scanned, updated, skip_invalid: skipInvalid, errors }]);
  if (errors > 0) {
    console.error(`\n❌ ${errors} 件のエラー。ログを確認してください。`);
    process.exit(1);
  }
  if (updated === 0) {
    console.info("\n✅ backfill 済み (updated=0)。平文停止・フォールバック削除・列DROP の PR をデプロイ可能。");
  } else {
    console.info("\nℹ️  実行済み。再度叩いて updated=0 になることを確認してください。");
  }
}

// 直接実行時のみ main() を走らせる (テストから純粋関数を import しても副作用なし)。
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error("Fatal:", e);
    process.exit(1);
  });
}
