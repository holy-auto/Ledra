import type { DocumentRow } from "@/types/document";

type EligibilityDoc = Pick<DocumentRow, "doc_type" | "status" | "customer_id">;

/** 合算請求書の元にできるのは納品書・請求書のみ（見積書や領収書等は対象外）で、
 *  顧客が紐づいておりキャンセル・却下されていないもの。 */
export function isConsolidatableDoc(doc: EligibilityDoc): boolean {
  return (
    (doc.doc_type === "delivery" || doc.doc_type === "invoice") &&
    !!doc.customer_id &&
    doc.status !== "cancelled" &&
    doc.status !== "rejected"
  );
}

/** 選択された帳票を合算請求書として作成できるか判定する。 */
export function canConsolidateDocuments(docs: EligibilityDoc[]): { ok: boolean; reason?: string } {
  if (docs.length === 0) return { ok: false };
  if (docs.length < 2) return { ok: false, reason: "合算するには2件以上選択してください" };
  const customerIds = new Set(docs.map((d) => d.customer_id).filter(Boolean));
  if (customerIds.size > 1) return { ok: false, reason: "同じ顧客の帳票のみ合算できます" };
  if (!docs.every(isConsolidatableDoc)) {
    return { ok: false, reason: "合算できるのは納品書・請求書のみです（キャンセル・却下済みを除く）" };
  }
  return { ok: true };
}
