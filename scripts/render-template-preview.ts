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
 *   npx tsx scripts/render-template-preview.ts [docType] [outPath]
 *   例: ... npx tsx scripts/render-template-preview.ts invoice out/invoice.pdf
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { renderDocumentPdf, type DocForPdf, type TenantForDocPdf } from "@/lib/pdfDocument";

const docType = process.argv[2] || "estimate";
const outPath = path.resolve(process.argv[3] || `out/template-${docType}.pdf`);

const doc: DocForPdf = {
  id: "sample",
  doc_type: docType,
  doc_number: "SAMPLE-202604-001",
  issued_at: "2026-04-22",
  due_date: "2026-05-31",
  subtotal: 112950,
  tax: 11295,
  total: 124245,
  tax_rate: 10,
  note: "備考欄はこの位置に表示されます。",
  items_json: [
    { description: "サンプル商品A", quantity: 1, unit: "個", unit_price: 57750, amount: 57750 },
    { description: "サンプル商品B", quantity: 2, unit: "個", unit_price: 17600, amount: 35200 },
    { description: "施工費", quantity: 1, unit: "式", unit_price: 20000, amount: 20000 },
  ],
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
  const buf = await renderDocumentPdf(doc, tenant, null);
  mkdirSync(path.dirname(outPath), { recursive: true });
  writeFileSync(outPath, buf);
  console.log(outPath);
})();
