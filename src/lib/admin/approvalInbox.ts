/**
 * 統一承認インボックスの純関数。
 *
 * AI / 自動化が「下書き」まで用意し、人の承認（壁3 の 1 タップ）を待っている
 * 案件を、テナント横断ではなく **1 テナント分** だけ正規化して返す。LLM は
 * 使わず、DB の状態（status=draft 等）だけで決定的に「今、承認すべきもの」を
 * 集約する。`todayTasks`（ナビ用タイル）の "アクション版"。
 *
 * IO は API ルート側に置き、ここは純関数としてテスト可能に切り出す。
 */

export type InboxActionKind = "issue_certificate" | "approve_purchase_order";

export interface InboxItem {
  /** 対象エンティティの識別子（証明書は public_id、その他は id） */
  id: string;
  title: string;
  subtitle: string;
  /** 詳細を確認する遷移先 */
  href: string;
  /** ワンタップ承認アクション。確認のみ（壁3 で外向き確定を伴う）の場合は省略。 */
  action?: { kind: InboxActionKind; label: string };
  /**
   * この下書きが「なぜ」用意されたかの短い説明。実データが無い種別では
   * 数値を捏造せず省略する（証明書=AI信頼度、発注=起票理由の実文言、
   * 請求書=生成プロセスの一般説明のみ）。
   */
  why?: string;
}

export interface InboxSection {
  key: "certificates" | "purchase_orders" | "invoices";
  label: string;
  hint: string;
  count: number;
  items: InboxItem[];
}

export interface InboxCertificate {
  public_id: string;
  customer_name?: string | null;
  service_type?: string | null;
  /** 元になった予約の AI 下書き自己評価（0.0〜1.0）。無ければ「なぜ」を出さない。 */
  confidence?: number | null;
  missingInfo?: string[] | null;
}
export interface InboxPurchaseOrder {
  id: string;
  po_number?: string | null;
  supplier_name?: string | null;
  subtotal?: number | null;
  /** 自動起票時に書き込まれる決定的な理由文言（数値の信頼度ではない）。 */
  note?: string | null;
}
export interface InboxInvoice {
  id: string;
  doc_number?: string | null;
  recipient_name?: string | null;
  total?: number | null;
}

function jpy(n: number | null | undefined): string {
  return `¥${Math.round(n ?? 0).toLocaleString("ja-JP")}`;
}

/**
 * 証明書ドラフトの「なぜ」。confidence が無い（=手動下書き等で AI 自己評価が
 * 存在しない）場合は数値を捏造せず undefined を返す。
 */
function certificateWhy(
  confidence: number | null | undefined,
  missingInfo: string[] | null | undefined,
): string | undefined {
  if (typeof confidence !== "number") return undefined;
  const pct = Math.round(confidence * 100);
  // ai_certificate_draft は非スキーマ拘束の JSONB なので、壊れた/古いスナップショットに
  // 文字列以外が混ざっていても trim() で例外にしない（1件の不正データで
  // /api/admin/inbox 全体を 500 にしない）。
  const missing = (missingInfo ?? []).filter((m) => typeof m === "string" && m.trim().length > 0);
  return missing.length > 0 ? `AI信頼度 ${pct}% ・未確認: ${missing.join("、")}` : `AI信頼度 ${pct}%`;
}

/**
 * 3 種のドラフト（証明書 / 発注 / 請求）を承認インボックスのセクションに正規化する。
 *
 * - 証明書ドラフト → ワンタップ「発行」（draft→active = 法的確定、壁3 を人が 1 タップ）
 * - 発注ドラフト   → ワンタップ「承認」（draft→approved。仕入先への送信は別操作）
 * - 請求書ドラフト → 確認導線のみ（送付は金額の外向き確定なので請求書画面で実施）
 *
 * 空のセクションは返さない。
 */
export function buildApprovalInbox(input: {
  certificates: InboxCertificate[];
  purchaseOrders: InboxPurchaseOrder[];
  invoices: InboxInvoice[];
}): { sections: InboxSection[]; total: number } {
  const sections: InboxSection[] = [];

  const certItems: InboxItem[] = input.certificates.map((c) => ({
    id: c.public_id,
    title: c.customer_name?.trim() || "（顧客名なし）",
    subtitle: c.service_type?.trim() || "施工証明書",
    href: "/admin/certificates",
    action: { kind: "issue_certificate", label: "発行" },
    why: certificateWhy(c.confidence, c.missingInfo),
  }));
  if (certItems.length > 0) {
    sections.push({
      key: "certificates",
      label: "証明書ドラフト",
      hint: "内容を確認して発行（draft→発行）。発行は法的確定なので必ず人が承認します（壁3）。",
      count: certItems.length,
      items: certItems,
    });
  }

  const poItems: InboxItem[] = input.purchaseOrders.map((p) => ({
    id: p.id,
    title: p.supplier_name?.trim() || p.po_number?.trim() || "発注書",
    subtitle: [p.po_number?.trim(), jpy(p.subtotal)].filter(Boolean).join(" / "),
    href: "/admin/inventory",
    action: { kind: "approve_purchase_order", label: "承認" },
    why: p.note?.trim() || undefined,
  }));
  if (poItems.length > 0) {
    sections.push({
      key: "purchase_orders",
      label: "発注ドラフト",
      hint: "AI が低在庫から起票した発注書。承認後、仕入先への送信は別操作です（壁3）。",
      count: poItems.length,
      items: poItems,
    });
  }

  const invItems: InboxItem[] = input.invoices.map((d) => ({
    id: d.id,
    title: d.recipient_name?.trim() || d.doc_number?.trim() || "請求書",
    subtitle: [d.doc_number?.trim(), jpy(d.total)].filter(Boolean).join(" / "),
    href: "/admin/invoices",
    // 送付（金額の外向き確定 = 壁3）はインボックスからは行わず、請求書画面で確認のうえ実施。
  }));
  if (invItems.length > 0) {
    sections.push({
      key: "invoices",
      label: "請求書ドラフト",
      hint: "送付（金額の外向き確定）は請求書画面で内容を確認のうえ行ってください。",
      count: invItems.length,
      items: invItems,
    });
  }

  const total = sections.reduce((sum, s) => sum + s.count, 0);
  return { sections, total };
}
