/**
 * 会計エクスポート — 月次売上の CSV 生成 (freee / MFクラウド / 汎用)。
 *
 * 対象: 指定年月に「入金済み (paid)」または「引渡済み (delivered)」となった
 * 請求書 (documents.doc_type='invoice')。
 *
 * 「いつの売上か」の基準日:
 *   - paid 行は payment_date があればそれ、無ければ issued_at。
 *   - その他 (delivered など) は issued_at。
 *   どちらも指定年月に含まれるものを対象とする。
 *
 * テナント境界: createTenantScopedAdmin + 明示的 tenant_id 絞り込み。
 */

import { createTenantScopedAdmin } from "@/lib/supabase/admin";

export const ACCOUNTING_FORMATS = ["freee", "mfcloud", "generic"] as const;
export type AccountingFormat = (typeof ACCOUNTING_FORMATS)[number];

export function isAccountingFormat(v: unknown): v is AccountingFormat {
  return typeof v === "string" && (ACCOUNTING_FORMATS as readonly string[]).includes(v);
}

export interface AccountingRow {
  id: string;
  invoice_number: string | null;
  customer_name: string | null;
  issued_at: string | null;
  payment_date: string | null;
  status: string | null;
  subtotal: number;
  tax: number;
  total: number;
}

export interface AccountingSummary {
  year: number;
  month: number;
  count: number;
  subtotal_total: number;
  tax_total: number;
  grand_total: number;
}

type DocRow = {
  id: string;
  doc_number: string | null;
  customer_id: string | null;
  recipient_name: string | null;
  issued_at: string | null;
  payment_date: string | null;
  status: string | null;
  subtotal: number | null;
  tax: number | null;
  total: number | null;
};

/** YYYY-MM-DD の月 (1-12) を返す。パース不能なら null。 */
function monthOf(dateStr: string | null): { y: number; m: number } | null {
  if (!dateStr) return null;
  const m = /^(\d{4})-(\d{2})/.exec(dateStr);
  if (!m) return null;
  return { y: Number(m[1]), m: Number(m[2]) };
}

/** 月初・月末の YYYY-MM-DD を返す。 */
function monthRange(year: number, month: number): { start: string; end: string } {
  const mm = String(month).padStart(2, "0");
  const start = `${year}-${mm}-01`;
  // 翌月 0 日 = 当月末日。
  const endDate = new Date(Date.UTC(year, month, 0));
  const end = endDate.toISOString().slice(0, 10);
  return { start, end };
}

/**
 * 指定年月の売上行を取得する。
 *
 * クエリは issued_at が当月、または payment_date が当月のいずれかを広めに取得し、
 * アプリ側で「売上計上日 (payment_date ?? issued_at) が当月」に最終フィルタする。
 */
export async function fetchAccountingRows(tenantId: string, year: number, month: number): Promise<AccountingRow[]> {
  const { admin } = createTenantScopedAdmin(tenantId);
  const { start, end } = monthRange(year, month);

  const { data, error } = await admin
    .from("documents")
    .select("id, doc_number, customer_id, recipient_name, issued_at, payment_date, status, subtotal, tax, total")
    .eq("tenant_id", tenantId)
    .eq("doc_type", "invoice")
    .in("status", ["paid", "delivered"])
    // issued_at が当月 OR payment_date が当月 を広めに取得 (最終判定はアプリ側)。
    .or(`and(issued_at.gte.${start},issued_at.lte.${end}),and(payment_date.gte.${start},payment_date.lte.${end})`)
    .order("issued_at", { ascending: true })
    .limit(10000)
    .returns<DocRow[]>();
  if (error) throw new Error(`fetchAccountingRows: ${error.message}`);

  const rows = data ?? [];

  // 顧客名解決 (recipient_name が無い行のフォールバック)。
  const customerIds = [...new Set(rows.map((r) => r.customer_id).filter(Boolean))] as string[];
  const nameMap = new Map<string, string | null>();
  if (customerIds.length > 0) {
    const { data: custs } = await admin
      .from("customers")
      .select("id, name")
      .eq("tenant_id", tenantId)
      .in("id", customerIds);
    for (const c of (custs ?? []) as Array<{ id: string; name: string | null }>) nameMap.set(c.id, c.name);
  }

  const out: AccountingRow[] = [];
  for (const r of rows) {
    // 売上計上日 = payment_date ?? issued_at。当月のものだけ残す。
    const basis = r.payment_date ?? r.issued_at;
    const mo = monthOf(basis);
    if (!mo || mo.y !== year || mo.m !== month) continue;
    out.push({
      id: r.id,
      invoice_number: r.doc_number,
      customer_name: r.recipient_name || (r.customer_id ? (nameMap.get(r.customer_id) ?? null) : null),
      issued_at: r.issued_at,
      payment_date: r.payment_date,
      status: r.status,
      subtotal: r.subtotal ?? 0,
      tax: r.tax ?? 0,
      total: r.total ?? 0,
    });
  }
  return out;
}

export function summarize(rows: AccountingRow[], year: number, month: number): AccountingSummary {
  let subtotal = 0;
  let tax = 0;
  let total = 0;
  for (const r of rows) {
    subtotal += r.subtotal;
    tax += r.tax;
    total += r.total;
  }
  return {
    year,
    month,
    count: rows.length,
    subtotal_total: subtotal,
    tax_total: tax,
    grand_total: total,
  };
}

// ─── CSV 生成 ───
function csvEscape(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** 売上計上日 (YYYY/MM/DD)。freee / MF は / 区切りが一般的。 */
function bookDate(r: AccountingRow): string {
  const d = r.payment_date ?? r.issued_at ?? "";
  return d.replace(/-/g, "/");
}

function buildFreeeCsv(rows: AccountingRow[]): string {
  // 取引日,収入金額,支出金額,勘定科目,取引先,備考
  const header = ["取引日", "収入金額", "支出金額", "勘定科目", "取引先", "備考"];
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push(
      [
        csvEscape(bookDate(r)),
        csvEscape(r.total),
        csvEscape(0),
        csvEscape("売上高"),
        csvEscape(r.customer_name ?? ""),
        csvEscape(`請求書 ${r.invoice_number ?? ""} (税 ${r.tax})`),
      ].join(","),
    );
  }
  return lines.join("\r\n");
}

function buildMfCloudCsv(rows: AccountingRow[]): string {
  // 日付,借方勘定科目,借方税区分,借方金額,貸方勘定科目,貸方税区分,貸方金額,摘要
  const header = ["日付", "借方勘定科目", "借方税区分", "借方金額", "貸方勘定科目", "貸方税区分", "貸方金額", "摘要"];
  const lines = [header.join(",")];
  for (const r of rows) {
    // 借方: 売掛金 (総額) / 貸方: 売上高 (税抜) + 仮受消費税。
    // 1 取引を 2 行に分けず、総額仕訳を簡潔に表現する (取込側で調整可能)。
    const summary = `${r.customer_name ?? ""} 請求書 ${r.invoice_number ?? ""}`.trim();
    lines.push(
      [
        csvEscape(bookDate(r)),
        csvEscape("売掛金"),
        csvEscape("対象外"),
        csvEscape(r.total),
        csvEscape("売上高"),
        csvEscape("課税売上10%"),
        csvEscape(r.subtotal),
        csvEscape(summary),
      ].join(","),
    );
    if (r.tax > 0) {
      lines.push(
        [
          csvEscape(bookDate(r)),
          csvEscape("売掛金"),
          csvEscape("対象外"),
          csvEscape(0),
          csvEscape("仮受消費税"),
          csvEscape("対象外"),
          csvEscape(r.tax),
          csvEscape(`${summary} 消費税`),
        ].join(","),
      );
    }
  }
  return lines.join("\r\n");
}

function buildGenericCsv(rows: AccountingRow[]): string {
  // date,invoice_number,customer_name,subtotal,tax,total,status
  const header = ["date", "invoice_number", "customer_name", "subtotal", "tax", "total", "status"];
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push(
      [
        csvEscape(r.payment_date ?? r.issued_at ?? ""),
        csvEscape(r.invoice_number ?? ""),
        csvEscape(r.customer_name ?? ""),
        csvEscape(r.subtotal),
        csvEscape(r.tax),
        csvEscape(r.total),
        csvEscape(r.status ?? ""),
      ].join(","),
    );
  }
  return lines.join("\r\n");
}

/** フォーマット別に CSV 本文を生成する (BOM なし; 呼び出し側で付与)。 */
export function buildAccountingCsv(rows: AccountingRow[], format: AccountingFormat): string {
  switch (format) {
    case "freee":
      return buildFreeeCsv(rows);
    case "mfcloud":
      return buildMfCloudCsv(rows);
    case "generic":
    default:
      return buildGenericCsv(rows);
  }
}
