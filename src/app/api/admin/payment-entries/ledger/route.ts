import { NextRequest } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { apiJson, apiUnauthorized, apiInternalError } from "@/lib/api/response";

export const dynamic = "force-dynamic";

/**
 * 売掛元帳 (Accounts Receivable Ledger)
 *
 * 帳票ごとに「合計 (total)」と「入金済 (Σ payment_entries.amount)」を突合し、
 * 残高 (outstanding = total - paid) が残っているものだけを返す。
 *
 * 集計対象は請求性のある確定済み帳票のみ:
 *   - draft (下書き) / cancelled (取消) / rejected (却下) は除外。
 * core schema の documents.status は
 *   draft | sent | accepted | paid | rejected | cancelled。
 */

// 「未請求 / 無効」扱いで売掛集計から外すステータス。
const EXCLUDED_STATUSES = ["draft", "cancelled", "rejected"] as const;
// 売掛（未回収）として数える帳票タイプ。見積 (estimate) / 納品書 (delivery) / 領収書 (receipt) は
// 請求ではないため、documents に同居していても未回収額に混ぜない（入金記帳の doc_type 制限と揃える）。
const RECEIVABLE_DOC_TYPES = ["invoice", "consolidated_invoice"] as const;

export async function GET(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const url = new URL(req.url);
    const customerId = (url.searchParams.get("customer_id") ?? "").trim();

    // 対象帳票を取得 (除外ステータス以外)
    let docQuery = supabase
      .from("documents")
      .select("id, doc_number, doc_type, customer_id, issued_at, status, total, created_at")
      .eq("tenant_id", caller.tenantId)
      .in("doc_type", RECEIVABLE_DOC_TYPES as unknown as string[])
      .not("status", "in", `(${EXCLUDED_STATUSES.join(",")})`)
      .order("created_at", { ascending: false });

    if (customerId) docQuery = docQuery.eq("customer_id", customerId);

    const { data: docs, error } = await docQuery;
    if (error) return apiInternalError(error, "payment-entries ledger GET");

    if (!docs || docs.length === 0) {
      return apiJson({ ledger: [], stats: { total_outstanding: 0, document_count: 0 } });
    }

    const docIds = docs.map((d) => d.id);

    // 帳票ごとの入金合計を集計
    const { data: payments, error: payErr } = await supabase
      .from("payment_entries")
      .select("document_id, amount")
      .eq("tenant_id", caller.tenantId)
      .in("document_id", docIds);
    if (payErr) return apiInternalError(payErr, "payment-entries ledger payments");

    const paidByDoc: Record<string, number> = {};
    for (const p of payments ?? []) {
      const did = p.document_id as string;
      paidByDoc[did] = (paidByDoc[did] ?? 0) + Number(p.amount ?? 0);
    }

    // 顧客名を並列取得
    const customerIds = [...new Set(docs.map((d) => d.customer_id).filter(Boolean))];
    const customerNames: Record<string, string> = {};
    if (customerIds.length > 0) {
      const { data: customers } = await supabase
        .from("customers")
        .select("id, name")
        .eq("tenant_id", caller.tenantId)
        .in("id", customerIds as string[]);
      for (const c of customers ?? []) customerNames[c.id] = c.name;
    }

    // 残高 > 0 の帳票のみ抽出
    const ledger = docs
      .map((d) => {
        const total = Number(d.total ?? 0);
        const paid = paidByDoc[d.id] ?? 0;
        return {
          document_id: d.id,
          doc_number: d.doc_number,
          doc_type: d.doc_type,
          customer_id: d.customer_id,
          customer_name: d.customer_id ? (customerNames[d.customer_id] ?? null) : null,
          issued_at: d.issued_at,
          status: d.status,
          total,
          paid,
          outstanding: total - paid,
          created_at: d.created_at,
        };
      })
      .filter((row) => row.outstanding > 0);

    const totalOutstanding = ledger.reduce((sum, row) => sum + row.outstanding, 0);

    return apiJson({
      ledger,
      stats: { total_outstanding: totalOutstanding, document_count: ledger.length },
    });
  } catch (e) {
    return apiInternalError(e, "payment-entries ledger GET");
  }
}
