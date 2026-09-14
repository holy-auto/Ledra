/**
 * 帳票の基本テンプレート（DEFAULT_LAYOUT）を実データなしで PDF に出力する。
 * pdfDocument.tsx の本番レンダラーをそのまま呼ぶので、見た目はテナントが
 * 実際に受け取る PDF と同じ（ロゴ・社印は未設定のためプレースホルダー）。
 *
 * DB へは一切アクセスしないが、import 経路上 supabase-js の生成だけ通るのでダミー値が要る。
 *
 * Usage:
 *   NEXT_PUBLIC_SUPABASE_URL=https://placeholder.supabase.co \
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY=placeholder \
 *   SUPABASE_SERVICE_ROLE_KEY=placeholder \
 *   npx tsx scripts/render-template-preview.ts [docType|all] [outPath] [--reduced]
 *
 *   例: ... render-template-preview.ts invoice out/invoice.pdf
 *       ... render-template-preview.ts all                      # 全9種を out/ へ
 *       ... render-template-preview.ts invoice --reduced        # 軽減税率(8%)行を含める
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { DOC_TYPE_LABELS, renderDocumentPdf, type DocForPdf, type TenantForDocPdf } from "@/lib/pdfDocument";

const DOC_TYPES = Object.keys(DOC_TYPE_LABELS);

const flags = process.argv.slice(2).filter((a) => a.startsWith("--"));
const positional = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const withReduced = flags.includes("--reduced");
const target = positional[0] || "estimate";
const docTypes = target === "all" ? DOC_TYPES : [target];

const unknownFlags = flags.filter((f) => f !== "--reduced");
if (unknownFlags.length > 0) {
  console.error(`不明なフラグ: ${unknownFlags.join(", ")}（使えるのは --reduced のみ）`);
  process.exit(1);
}
if (target !== "all" && !DOC_TYPES.includes(target)) {
  console.error(`不明な帳票種別: ${target}\n指定できるのは all / ${DOC_TYPES.join(" / ")}`);
  process.exit(1);
}
if (target === "all" && positional[1]) {
  console.error("all と出力先パスは同時に指定できません（out/template-<種別>.pdf へ出力されます）");
  process.exit(1);
}

const items: DocForPdf["items_json"] = [
  { description: "サンプル商品A", quantity: 1, unit: "個", unit_price: 57750, amount: 57750 },
  { description: "サンプル商品B", quantity: 2, unit: "個", unit_price: 17600, amount: 35200 },
  { description: "施工費", quantity: 1, unit: "式", unit_price: 20000, amount: 20000 },
];
if (withReduced) {
  // 軽減税率対象行。小計・消費税・合計は breakdown から再計算されるので stored 値は触らない。
  items.push({
    description: "サンプル飲料（軽減税率対象）",
    quantity: 2,
    unit: "本",
    unit_price: 500,
    amount: 1000,
    tax_category: 8,
    is_reduced_rate: true,
  });
}

const doc: DocForPdf = {
  id: "sample",
  doc_type: "estimate",
  doc_number: "SAMPLE-202604-001",
  issued_at: "2026-04-22",
  due_date: "2026-05-31",
  subtotal: 112950,
  tax: 11295,
  total: 124245,
  tax_rate: 10,
  note: "備考欄はこの位置に表示されます。",
  items_json: items,
  is_invoice_compliant: true,
  show_seal: true,
  show_logo: true,
  show_bank_info: true,
  recipient_name: "株式会社サンプル",
  recipient_honorific: "御中",
  recipient_postal_code: "150-0001",
  recipient_address: "東京都渋谷区神宮前1-2-3",
  recipient_phone: "03-1111-2222",
  subject: "〇〇商品 一式",
  period_start: "2026-04-01",
  period_end: "2026-04-30",
  payment_terms: "月末締翌月末払",
  vehicle_info_json: { model: "サンプル車種", plate: "品川 300 あ 12-34" },
};

const tenant: TenantForDocPdf = {
  name: "株式会社サンプル商事",
  address: "東京都千代田区千代田1-1",
  contact_email: "info@example.com",
  contact_phone: "03-0000-0000",
  postal_code: "100-0001",
  registration_number: "T1234567890123",
  logo_asset_path: null,
  company_seal_path: null,
  bank_info: {
    bank_name: "サンプル銀行",
    branch_name: "本店",
    account_type: "普通",
    account_number: "1234567",
    account_holder: "カ）サンプルシヨウジ",
  },
};

void (async () => {
  for (const docType of docTypes) {
    const outPath = path.resolve(positional[1] ?? `out/template-${docType}${withReduced ? "-reduced" : ""}.pdf`);
    const buf = await renderDocumentPdf({ ...doc, doc_type: docType }, tenant, null);
    mkdirSync(path.dirname(outPath), { recursive: true });
    writeFileSync(outPath, buf);
    console.log(outPath);
  }
})();
