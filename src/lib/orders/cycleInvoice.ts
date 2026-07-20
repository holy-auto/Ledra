import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { insertDocWithRetry } from "@/lib/invoice/invoiceNumber";
import { todayJst } from "@/lib/gantt/board";
import { logger } from "@/lib/logger";

const DEFAULT_TERMS_DAYS = 30;

/** JST の (year, month1-12, day) を返す。 */
function jstParts(now: Date): { y: number; m: number; d: number } {
  const ymd = todayJst(now); // "YYYY-MM-DD"
  return { y: Number(ymd.slice(0, 4)), m: Number(ymd.slice(5, 7)), d: Number(ymd.slice(8, 10)) };
}

/** その月の末日 (1-31)。UTC 固定計算で日付ズレを避ける。 */
function lastDayOfMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/**
 * 締め日から支払期限を算出する（closing 当日 + termsDays）。YYYY-MM-DD を返す。
 * closing は本日(JST)なので、本日 + termsDays を UTC 固定で計算する。
 */
export function dueDateFromClosing(y: number, m: number, d: number, termsDays: number | null): string {
  const base = Date.UTC(y, m - 1, d);
  const due = new Date(base + (termsDays ?? DEFAULT_TERMS_DAYS) * 86400000);
  return due.toISOString().slice(0, 10);
}

/**
 * その顧客の締め日が「本日(JST)」に当たるか。closing_day が当月末日を超える場合
 * （例 31 を 2 月に設定）は当月末日に丸める。
 */
export function isClosingToday(closingDay: number | null, y: number, m: number, d: number): boolean {
  if (closingDay == null) return false;
  const effective = Math.min(closingDay, lastDayOfMonth(y, m));
  return effective === d;
}

interface CycleOrderRow {
  id: string;
  title: string;
  category: string | null;
  accepted_amount: number | null;
}

/**
 * 顧客の締め日に、その顧客（＝取引先テナント）への指名オーダーを合算した
 * 請求書(documents.consolidated_invoice)を **下書き** で生成する。確認後、発行元が
 * /admin/documents/share から送付する（確認後送付）。
 *
 * 集約対象: billing_method='invoice' かつ status in (payment_pending, completed) かつ
 *   invoice_number 未設定（未請求）の、from=顧客の linked_tenant_id / to=顧客の tenant_id。
 * 集約済みオーダーには生成した請求書番号を stamp し、二重集約を防ぐ。
 *
 * @param targetDate 判定基準日（デフォルト今日）。締め日一致の顧客のみ処理する。
 */
export async function runCycleInvoices(targetDate?: Date): Promise<{ generated: number; errors: number }> {
  const supabase = createServiceRoleAdmin("orders/cycleInvoice: 顧客締め日ごとの合算請求(下書き)生成");
  const now = targetDate ?? new Date();
  const { y, m, d } = jstParts(now);
  const issuedYmd = todayJst(now);

  // 合算・締め払いの顧客（取引先テナント紐付けあり）を全テナント横断で取得。
  // ponytail: 全 consolidated 顧客を取得して JS で締め日一致を判定。顧客数が
  //   桁違いに増えたら closing_day = 当日 の SQL 絞り込み（末日丸めは別途）へ。
  const { data: customers, error: custErr } = await supabase
    .from("customers")
    .select("id, tenant_id, name, closing_day, payment_terms_days, linked_tenant_id")
    .eq("billing_cycle", "consolidated")
    .not("closing_day", "is", null)
    .not("linked_tenant_id", "is", null);

  if (custErr) {
    logger.error("[cycleInvoice] customers fetch failed", { error: custErr.message });
    return { generated: 0, errors: 1 };
  }

  const dueParts = { y, m, d };
  let generated = 0;
  let errors = 0;

  for (const cust of customers ?? []) {
    if (!isClosingToday(cust.closing_day as number | null, y, m, d)) continue;

    const toTenantId = cust.tenant_id as string;
    const fromTenantId = cust.linked_tenant_id as string;

    try {
      // 未請求の指名オーダーを集約
      const { data: orders, error: ordErr } = await supabase
        .from("job_orders")
        .select("id, title, category, accepted_amount")
        .eq("to_tenant_id", toTenantId)
        .eq("from_tenant_id", fromTenantId)
        .eq("billing_method", "invoice")
        .in("status", ["payment_pending", "completed"])
        .is("invoice_number", null)
        .not("accepted_amount", "is", null);

      if (ordErr) {
        logger.error("[cycleInvoice] orders fetch failed", { customerId: cust.id, error: ordErr.message });
        errors++;
        continue;
      }

      const rows = (orders ?? []) as CycleOrderRow[];
      if (rows.length === 0) continue;

      const total = rows.reduce((s, o) => s + (o.accepted_amount ?? 0), 0);
      if (total <= 0) continue;

      const items = rows.map((o) => ({
        description: `${o.title}${o.category ? ` (${o.category})` : ""}`,
        quantity: 1,
        unit_price: o.accepted_amount ?? 0,
        amount: o.accepted_amount ?? 0,
      }));

      const dueYmd = dueDateFromClosing(dueParts.y, dueParts.m, dueParts.d, cust.payment_terms_days as number | null);

      // consolidated_invoice を下書きで INSERT（CINV-YYYYMM-NNN 採番）
      const { data: doc, error: insErr } = await insertDocWithRetry(
        supabase,
        toTenantId,
        "consolidated_invoice",
        "CINV",
        (docNumber: string) =>
          supabase
            .from("documents")
            .insert({
              tenant_id: toTenantId,
              counterparty_tenant_id: fromTenantId,
              customer_id: cust.id,
              doc_type: "consolidated_invoice",
              doc_number: docNumber,
              issued_at: issuedYmd,
              due_date: dueYmd,
              status: "draft",
              subtotal: total,
              tax: 0,
              total,
              tax_rate: 0,
              items_json: items,
              note: `Ledra 加盟店間の合算請求（${rows.length}件・手数料なし）。締め日: ${issuedYmd}`,
              meta_json: { source: "job_order_cycle", job_order_ids: rows.map((o) => o.id) },
              is_invoice_compliant: false,
              show_seal: false,
              show_logo: true,
              recipient_name: cust.name ?? null,
            })
            .select("id, doc_number")
            .single(),
        { now },
      );

      if (insErr || !doc) {
        logger.error("[cycleInvoice] consolidated insert failed", { customerId: cust.id, error: insErr?.message });
        errors++;
        continue;
      }

      // 集約したオーダーに請求書番号を stamp（二重集約防止）
      await supabase
        .from("job_orders")
        .update({ invoice_number: doc.doc_number as string, invoice_due_date: dueYmd })
        .in(
          "id",
          rows.map((o) => o.id),
        );

      logger.info("[cycleInvoice] consolidated draft generated", {
        toTenantId,
        fromTenantId,
        customerId: cust.id,
        invoiceNumber: doc.doc_number,
        orderCount: rows.length,
        total,
      });
      generated++;
    } catch (e) {
      logger.error("[cycleInvoice] customer processing failed", { customerId: cust.id, error: String(e) });
      errors++;
    }
  }

  return { generated, errors };
}
