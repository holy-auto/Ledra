/**
 * AI auto-action 検証用: 指定テナントで「おまかせ運用」プリセット
 * (RECOMMENDED_AUTOMATION_ACTION_KEYS = 今回の新規6件を含む安全な auto-action) を
 * 一括 opt-in する。staging 検証の前提セットアップ。
 *
 * 使い方:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... TENANT_ID=<uuid> \
 *     npx tsx scripts/verify/optInAiAutomation.ts
 *
 * 注意: service-role を使うため **staging 専用**。本番には流さないこと。
 */
import { createClient } from "@supabase/supabase-js";
import { RECOMMENDED_AUTOMATION_ACTION_KEYS } from "../../src/lib/ai/automation/actionCatalog";

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const tenantId = process.env.TENANT_ID;

function fail(msg: string): never {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

async function main() {
  if (!url || !serviceKey) fail("SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY が必要です。");
  if (!tenantId) fail("TENANT_ID (検証対象テナントの uuid) が必要です。");

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  const autoActions: Record<string, boolean> = {};
  for (const k of RECOMMENDED_AUTOMATION_ACTION_KEYS) autoActions[k] = true;

  const { error } = await admin.from("tenant_ai_automation_settings").upsert(
    {
      tenant_id: tenantId,
      enabled: true,
      auto_actions: autoActions,
      // 画像/書類ソースを ON (写真品質 Vision / 納品書 OCR が動くように)。
      source_policies: { photos: true, identity_documents: true },
    },
    { onConflict: "tenant_id" },
  );
  if (error) fail(`upsert 失敗: ${error.message}`);

  console.log(`✓ tenant ${tenantId} を opt-in しました (enabled=true)`);
  console.log(`  有効化した auto-actions (${Object.keys(autoActions).length} 件):`);
  for (const k of Object.keys(autoActions).sort()) console.log(`   - ${k}`);
  console.log("\n注意: プランが Standard 以上か / is_active=true か / ANTHROPIC_API_KEY 設定済みかも確認してください。");
}

main().catch((e) => fail(e instanceof Error ? e.message : String(e)));
