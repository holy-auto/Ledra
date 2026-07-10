/**
 * Centralized status-to-badge-variant maps.
 * Use with the unified Badge component for consistent status rendering.
 */

export type BadgeVariant = "default" | "success" | "warning" | "danger" | "info" | "violet";

type StatusEntry = { variant: BadgeVariant; label: string };

/* ── Certificate ── */
export const CERTIFICATE_STATUS_MAP: Record<string, StatusEntry> = {
  active: { variant: "success", label: "有効" },
  void: { variant: "danger", label: "無効" },
  expired: { variant: "warning", label: "期限切れ" },
  // 下書き = 人の承認待ち。サイドバー/ダッシュボードの承認導線と同じ琥珀(warning)で統一。
  draft: { variant: "warning", label: "下書き" },
};

/* ── NFC ── */
export const NFC_STATUS_MAP: Record<string, StatusEntry> = {
  prepared: { variant: "default", label: "準備済" },
  written: { variant: "info", label: "書込済" },
  attached: { variant: "success", label: "貼付済" },
  lost: { variant: "warning", label: "紛失" },
  retired: { variant: "default", label: "廃止" },
  error: { variant: "danger", label: "エラー" },
};

/* ── Document ── */
export const DOCUMENT_STATUS_MAP: Record<string, StatusEntry> = {
  draft: { variant: "warning", label: "下書き" },
  sent: { variant: "info", label: "送付済" },
  accepted: { variant: "success", label: "承認済" },
  paid: { variant: "success", label: "入金済" },
  rejected: { variant: "danger", label: "却下" },
  cancelled: { variant: "default", label: "取消" },
  overdue: { variant: "warning", label: "期限超過" },
};

/* ── Invoice ── */
export const INVOICE_STATUS_MAP: Record<string, StatusEntry> = {
  draft: { variant: "warning", label: "下書き" },
  sent: { variant: "info", label: "送付済" },
  paid: { variant: "success", label: "入金済" },
  overdue: { variant: "warning", label: "期限超過" },
  cancelled: { variant: "default", label: "取消" },
};

/* ── Payment ── */
export const PAYMENT_STATUS_MAP: Record<string, StatusEntry> = {
  completed: { variant: "success", label: "完了" },
  refunded: { variant: "danger", label: "返金済" },
  partial_refund: { variant: "warning", label: "一部返金" },
  voided: { variant: "default", label: "取消" },
};

/* ── Reservation Payment ── */
export const RESERVATION_PAYMENT_STATUS_MAP: Record<string, StatusEntry> = {
  unpaid: { variant: "default", label: "未会計" },
  paid: { variant: "success", label: "会計済" },
  partial: { variant: "warning", label: "一部入金" },
  refunded: { variant: "danger", label: "返金済" },
};

/* ── Agent Referral ── */
export const AGENT_REFERRAL_STATUS_MAP: Record<string, StatusEntry> = {
  pending: { variant: "default", label: "審査待ち" },
  contacted: { variant: "info", label: "連絡済み" },
  in_negotiation: { variant: "violet", label: "商談中" },
  trial: { variant: "warning", label: "トライアル中" },
  contracted: { variant: "success", label: "契約成立" },
  cancelled: { variant: "default", label: "キャンセル" },
  churned: { variant: "danger", label: "解約" },
};

/* ── Agent Commission ── */
export const AGENT_COMMISSION_STATUS_MAP: Record<string, StatusEntry> = {
  pending: { variant: "default", label: "未払い" },
  approved: { variant: "info", label: "承認済み" },
  paid: { variant: "success", label: "支払い済み" },
  failed: { variant: "danger", label: "支払い失敗" },
  cancelled: { variant: "default", label: "キャンセル" },
};

/* ── Agent Account ── */
export const AGENT_STATUS_MAP: Record<string, StatusEntry> = {
  active_pending_review: { variant: "warning", label: "仮登録" },
  active: { variant: "success", label: "有効" },
  suspended: { variant: "danger", label: "停止" },
};

/* ── Agent Application ── */
export const AGENT_APPLICATION_STATUS_MAP: Record<string, StatusEntry> = {
  submitted: { variant: "default", label: "申請済み" },
  under_review: { variant: "info", label: "審査中" },
  approved: { variant: "success", label: "承認済み" },
  rejected: { variant: "danger", label: "却下" },
};

/* ── Shared File Direction ── */
export const SHARED_FILE_DIRECTION_MAP: Record<string, StatusEntry> = {
  to_agent: { variant: "info", label: "本部→代理店" },
  to_hq: { variant: "violet", label: "代理店→本部" },
};

/* ── Signing Request ── */
export const SIGNING_STATUS_MAP: Record<string, StatusEntry> = {
  draft: { variant: "default", label: "下書き" },
  sent: { variant: "info", label: "送信済み" },
  viewed: { variant: "warning", label: "閲覧済み" },
  signed: { variant: "success", label: "署名完了" },
  rejected: { variant: "danger", label: "拒否" },
  expired: { variant: "default", label: "期限切れ" },
};

/* ── Utility: get status entry safely ── */
export function getStatusEntry(map: Record<string, StatusEntry>, status: string | null | undefined): StatusEntry {
  const key = String(status ?? "").toLowerCase();
  return map[key] ?? { variant: "default", label: status ?? "-" };
}
