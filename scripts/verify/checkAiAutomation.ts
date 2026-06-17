/**
 * AI auto-action 検証用: 指定テナントで各 auto-action が「実際に出力を保存したか」を
 * service-role で集計して PASS/FAIL 表示する。ハッピーパスを駆動した後に実行する。
 *
 * 使い方:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... TENANT_ID=<uuid> \
 *     npx tsx scripts/verify/checkAiAutomation.ts
 *
 * 注意: service-role を使うため **staging 専用**。
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const tenantId = process.env.TENANT_ID;

function fail(msg: string): never {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

/** count(*) only (head:true) を返す小ヘルパ。エラー時は -1。 */
async function count(
  admin: SupabaseClient,
  table: string,
  build: (q: any) => any, // eslint-disable-line @typescript-eslint/no-explicit-any
): Promise<number> {
  let q = admin.from(table).select("id", { count: "exact", head: true }).eq("tenant_id", tenantId);
  q = build(q);
  const { count: c, error } = await q;
  if (error) {
    console.error(`  (query error on ${table}: ${error.message})`);
    return -1;
  }
  return c ?? 0;
}

async function main() {
  if (!url || !serviceKey) fail("SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY が必要です。");
  if (!tenantId) fail("TENANT_ID が必要です。");
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  const checks: Array<{ key: string; label: string; n: Promise<number> }> = [
    {
      key: "inquiry.auto_classify",
      label: "#1 問い合わせ自動分類 (customer_inquiries.ai_classified_at)",
      n: count(admin, "customer_inquiries", (q) => q.not("ai_classified_at", "is", null)),
    },
    {
      key: "insurer_case.auto_summary",
      label: "#3 案件サマリ (insurer_cases.meta.ai_summary.source=auto)",
      n: count(admin, "insurer_cases", (q) => q.eq("meta->ai_summary->>source", "auto")),
    },
    {
      key: "insurer_case.auto_assign_suggest",
      label: "#4 担当提案 (insurer_cases.meta.ai_assign_suggestion.source=auto)",
      n: count(admin, "insurer_cases", (q) => q.eq("meta->ai_assign_suggestion->>source", "auto")),
    },
    {
      key: "photo.auto_quality_check",
      label: "#7 写真品質 (certificates.meta.quality_check.source=auto)",
      n: count(admin, "certificates", (q) => q.eq("meta->quality_check->>source", "auto")),
    },
    {
      key: "job.auto_next_action",
      label: "#5 案件次手 (reservations.ai_next_action.source=auto)",
      n: count(admin, "reservations", (q) => q.eq("ai_next_action->>source", "auto")),
    },
    {
      key: "parts.auto_reconcile_delivery_note",
      label: "#28 納品書三方照合 (part_integrity_findings rule=three_way/qty)",
      n: count(admin, "part_integrity_findings", (q) => q.in("rule", ["three_way_mismatch", "qty_mismatch"])),
    },
  ];

  console.log(`\nAI auto-action 検証結果 — tenant ${tenantId}\n`);
  let pass = 0;
  for (const c of checks) {
    const n = await c.n;
    const mark = n > 0 ? "✅ PASS" : n === 0 ? "—  none" : "✗  ERR";
    if (n > 0) pass++;
    console.log(`${mark}  ${c.label}  (rows=${n})`);
  }
  console.log(`\n${pass}/${checks.length} auto-action が出力を保存済み。`);
  console.log("'none' は「まだそのハッピーパスを駆動していない」可能性 (runbook の手順で発火させてください)。");
}

main().catch((e) => fail(e instanceof Error ? e.message : String(e)));
