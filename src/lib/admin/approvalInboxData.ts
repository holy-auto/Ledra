import type { SupabaseClient } from "@supabase/supabase-js";
import { buildApprovalInbox, type InboxSection } from "@/lib/admin/approvalInbox";
import { hasPermission } from "@/lib/auth/permissions";
import type { Role } from "@/lib/auth/roles";

export type CertDraft = { confidence?: number; missingInfo?: string[] };
export type CertSnapshot = {
  draft?: CertDraft;
  drafts?: Array<{ category?: string | null; draft?: CertDraft }>;
};

/**
 * この証明書の「なぜ」に使う下書きを選ぶ。
 *
 * - `isAiAutoDraft` が false（= 手動作成の証明書。予約に AI 下書きがあっても
 *   この証明書自体は AI が作ったものではない）なら常に undefined を返す。
 *   手動下書きに予約側の AI 信頼度をそのまま出すと「AIが用意した」ように
 *   誤解させるため。
 * - true の場合、1台の予約に複数カテゴリー（コーティング／PPFなど）の下書きが
 *   あれば、証明書自身の service_type と一致するカテゴリーの下書きを選ぶ
 *   （無ければ先頭 = primary にフォールバック。単一下書き時は drafts 自体が
 *   存在しない）。これをしないと、2件目以降の証明書に別カテゴリーの信頼度が
 *   誤表示される。
 */
export function selectCertificateDraft(
  snapshot: CertSnapshot | null | undefined,
  serviceType: string | null,
  isAiAutoDraft: boolean,
): CertDraft | undefined {
  if (!isAiAutoDraft) return undefined;
  const matched = serviceType ? snapshot?.drafts?.find((d) => d.category === serviceType) : undefined;
  return matched?.draft ?? snapshot?.draft;
}

/** staff/viewer は dashboard:view はあっても menu_items:manage を持たないため、
 * この権限を持たない呼び出し元には発注セクション（件数・仕入先名・理由を含む）
 * 自体を見せない。role 省略時（互換のため）は常に許可。 */
export function canSeePurchaseOrders(role: Role | undefined): boolean {
  return role === undefined || hasPermission(role, "menu_items:manage");
}

/**
 * 承認インボックスのデータ取得（IO）。当テナントで人の承認を待つドラフト
 * （証明書 / 発注 / 請求）を集約して返す。承認インボックス API とダッシュボードの
 * 承認ウィジェットの双方から使う共通関数（クエリの二重管理を避ける）。
 * RLS + 明示の tenant_id で当テナントに限定。純粋な整形は buildApprovalInbox に委譲。
 *
 * `role` を渡すと、その画面 (/admin/inventory) に要求される権限
 * (menu_items:manage) を持たない呼び出し元には発注セクション自体を返さない
 * （件数・仕入先名・理由を含め非表示。staff/viewer は dashboard:view はあっても
 * menu_items:manage を持たないため、この権限チェックが無いと本来見えないはずの
 * 発注情報がダッシュボード・承認インボックス双方に漏れる）。
 */
export async function fetchApprovalInbox(
  supabase: SupabaseClient,
  tenantId: string,
  role?: Role,
): Promise<{ sections: InboxSection[]; total: number }> {
  const canViewPurchaseOrders = canSeePurchaseOrders(role);

  const [certs, pos, invs] = await Promise.all([
    supabase
      .from("certificates")
      // reservations は certificates.reservation_id → reservations.id と
      // reservations.ai_certificate_id → certificates.id の双方向 FK があり
      // embed が曖昧になるため、FK 制約名を明示して disambiguate する。
      .select(
        "public_id, customer_name, service_type, content_preset_json, reservations!certificates_reservation_id_fkey(ai_certificate_draft)",
      )
      .eq("tenant_id", tenantId)
      .eq("status", "draft")
      .order("created_at", { ascending: false })
      .limit(50),
    canViewPurchaseOrders
      ? supabase
          .from("purchase_orders")
          .select("id, po_number, subtotal, note, source, suppliers(name)")
          .eq("tenant_id", tenantId)
          .eq("status", "draft")
          .order("created_at", { ascending: false })
          .limit(50)
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from("documents")
      .select("id, doc_number, recipient_name, total")
      .eq("tenant_id", tenantId)
      .eq("doc_type", "invoice")
      .eq("status", "draft")
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  if (certs.error) throw certs.error;
  if (pos.error) throw pos.error;
  if (invs.error) throw invs.error;

  return buildApprovalInbox({
    certificates: (certs.data ?? []).map((c) => {
      const reservation = Array.isArray(c.reservations) ? c.reservations[0] : c.reservations;
      const snapshot = (reservation as { ai_certificate_draft?: CertSnapshot } | null)?.ai_certificate_draft;
      const serviceType = (c.service_type as string | null) ?? null;
      // AI が自動作成した証明書だけに content_preset_json.ai_auto_draft=true が付く。
      // 手動作成（予約に紐付けただけ）の下書きに、たまたま予約側にある AI 信頼度を
      // 誤って表示しないためのゲート。
      const isAiAutoDraft = (c.content_preset_json as { ai_auto_draft?: boolean } | null)?.ai_auto_draft === true;
      const draft = selectCertificateDraft(snapshot, serviceType, isAiAutoDraft);
      return {
        public_id: c.public_id as string,
        customer_name: (c.customer_name as string | null) ?? null,
        service_type: serviceType,
        confidence: typeof draft?.confidence === "number" ? draft.confidence : null,
        missingInfo: Array.isArray(draft?.missingInfo) ? draft.missingInfo : null,
      };
    }),
    purchaseOrders: (pos.data ?? []).map((p) => {
      const supplier = Array.isArray(p.suppliers) ? p.suppliers[0] : p.suppliers;
      return {
        id: p.id as string,
        po_number: (p.po_number as string | null) ?? null,
        subtotal: (p.subtotal as number | null) ?? null,
        // 手動作成 (source=manual) の note はスタッフ自身のメモであり AI の理由ではないため、
        // 自動起票 (source=auto) の時だけ why として表示する。
        note: p.source === "auto" ? ((p.note as string | null) ?? null) : null,
        supplier_name: ((supplier as { name?: string | null } | null)?.name as string | null) ?? null,
      };
    }),
    invoices: (invs.data ?? []).map((d) => ({
      id: d.id as string,
      doc_number: (d.doc_number as string | null) ?? null,
      recipient_name: (d.recipient_name as string | null) ?? null,
      total: (d.total as number | null) ?? null,
    })),
  });
}
