/**
 * 案件（予約）の連鎖タイムラインの純関数。
 *
 * 1 件の予約を起点に「予約 → 施工 → 証明書 → 請求 → フォロー」の進捗を
 * 決定的に組み立てる。LLM は使わず、各エンティティの status だけで状態を導く。
 * `todayTasks` / `approvalInbox` と同じ設計思想（IO は API、判定は純関数）。
 *
 * 紐付け（API 側で解決）:
 *   - 証明書: certificates.reservation_id = 予約.id（直接 FK）
 *   - 請求:   documents(doc_type=invoice) を customer_id (+ vehicle_id) で近似紐付け
 *   - フォロー: notification_logs(type=post_issue, target_id=証明書.id)
 */

export type CaseStepState = "done" | "current" | "pending" | "skipped";

/** ドロワー内から案件を前に進めるワンタップ操作（既存の安全なエンドポイントを再利用）。 */
export type CaseActionKind = "start_work" | "complete_work" | "issue_certificate";

export interface CaseStepAction {
  kind: CaseActionKind;
  label: string;
  /** issue_certificate のとき証明書 public_id。予約系は呼び出し側が予約 id を使う。 */
  targetId?: string;
}

export interface CaseStep {
  key: "reservation" | "work" | "certificate" | "invoice" | "follow_up";
  label: string;
  state: CaseStepState;
  detail: string;
  href?: string;
  action?: CaseStepAction;
}

export interface CaseTimelineInput {
  reservation: { status?: string | null };
  certificate?: { public_id?: string | null; status?: string | null } | null;
  invoice?: { id?: string | null; status?: string | null } | null;
  /** 発行後フォロー (post_issue) の notification_logs.status */
  followUp?: { status?: string | null } | null;
}

const CERT_HREF = "/admin/certificates";
const INVOICE_HREF = "/admin/invoices";

export function buildCaseTimeline(input: CaseTimelineInput): CaseStep[] {
  const resStatus = input.reservation.status ?? null;
  const cancelled = resStatus === "cancelled";

  // 1. 予約
  const reservation: CaseStep = {
    key: "reservation",
    label: "予約",
    state: cancelled ? "skipped" : "done",
    detail: cancelled ? "キャンセル" : "受付済み",
  };

  // 2. 施工（予約ステータスから導出）
  let work: CaseStep;
  if (cancelled) {
    work = { key: "work", label: "施工", state: "skipped", detail: "—" };
  } else if (resStatus === "completed") {
    work = { key: "work", label: "施工", state: "done", detail: "完了" };
  } else if (resStatus === "in_progress") {
    work = {
      key: "work",
      label: "施工",
      state: "current",
      detail: "作業中",
      action: { kind: "complete_work", label: "施工完了" },
    };
  } else {
    work = {
      key: "work",
      label: "施工",
      state: "pending",
      detail: "未着手",
      action: { kind: "start_work", label: "施工開始" },
    };
  }

  // 3. 証明書
  const certStatus = input.certificate?.status ?? null;
  let certificate: CaseStep;
  if (certStatus === "active") {
    certificate = { key: "certificate", label: "証明書", state: "done", detail: "発行済み", href: CERT_HREF };
  } else if (certStatus === "draft") {
    certificate = {
      key: "certificate",
      label: "証明書",
      state: "current",
      detail: "下書き（発行待ち）",
      href: CERT_HREF,
      action: input.certificate?.public_id
        ? { kind: "issue_certificate", label: "発行", targetId: input.certificate.public_id }
        : undefined,
    };
  } else if (certStatus === "void") {
    certificate = { key: "certificate", label: "証明書", state: "skipped", detail: "無効", href: CERT_HREF };
  } else {
    certificate = { key: "certificate", label: "証明書", state: "pending", detail: "未作成" };
  }

  // 4. 請求
  const invStatus = input.invoice?.status ?? null;
  let invoice: CaseStep;
  if (invStatus === "paid") {
    invoice = { key: "invoice", label: "請求", state: "done", detail: "入金済み", href: INVOICE_HREF };
  } else if (invStatus === "overdue") {
    invoice = { key: "invoice", label: "請求", state: "current", detail: "送付済み（期限超過）", href: INVOICE_HREF };
  } else if (invStatus === "sent" || invStatus === "accepted") {
    invoice = { key: "invoice", label: "請求", state: "current", detail: "送付済み（入金待ち）", href: INVOICE_HREF };
  } else if (invStatus === "draft") {
    invoice = { key: "invoice", label: "請求", state: "current", detail: "下書き", href: INVOICE_HREF };
  } else if (invStatus === "cancelled" || invStatus === "rejected") {
    invoice = {
      key: "invoice",
      label: "請求",
      state: "skipped",
      detail: invStatus === "rejected" ? "却下" : "取消",
      href: INVOICE_HREF,
    };
  } else {
    invoice = { key: "invoice", label: "請求", state: "pending", detail: "未作成" };
  }

  // 5. フォロー（発行後フォロー）
  const fu = input.followUp?.status ?? null;
  let follow_up: CaseStep;
  if (fu === "sent") {
    follow_up = { key: "follow_up", label: "フォロー", state: "done", detail: "送信済み" };
  } else if (fu === "queued") {
    follow_up = { key: "follow_up", label: "フォロー", state: "current", detail: "送信予約済み" };
  } else if (fu === "failed") {
    follow_up = { key: "follow_up", label: "フォロー", state: "current", detail: "送信失敗" };
  } else {
    follow_up = { key: "follow_up", label: "フォロー", state: "pending", detail: "未送信" };
  }

  return [reservation, work, certificate, invoice, follow_up];
}
