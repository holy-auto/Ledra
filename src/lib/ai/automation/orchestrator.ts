/**
 * イベント駆動オーケストレーションの「判定」層 (純関数のみ)。
 *
 * 「人がフォームを開かなくてもワークフローを前に進めてよいか」を、
 * テナント設定 (AiAutomationSettings) と抽出結果・文脈から決める。
 * 実際の DB 書き込み (IO) は inboundAuto.ts など呼び出し側が行う。
 *
 * 壁3 の遵守:
 *   - 金額確定 / 本人確認に触れる自動コミットはしない
 *     (新規顧客=本人の自動作成はしない / 金額は確定しない)
 *   - 証明書の「発行」は決して自動化しない (canAutoIssueCertificate は常に false)
 */

import { resolveAutoAction, type AiAutomationSettings } from "./policy";

/** YYYY-MM-DD の妥当な日付か (カレンダー的にも有効か) を検証する。 */
export function isValidYmd(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

// ─────────────────────────────────────────────
// 受信メッセージ (LINE / メール) → 予約
// ─────────────────────────────────────────────

/**
 * 受信時に AI 抽出を自動実行してよいか。
 * 抽出は「提案を先回りで用意するだけ」でコミットしないため安全 (非壁3)。
 */
export function shouldAutoExtractInbound(settings: AiAutomationSettings): boolean {
  return resolveAutoAction(settings, "inbound_message.auto_extract");
}

export interface InboundExtractionLike {
  intent?: string | null;
  confidence?: number | null;
  scheduled_date?: string | null;
  customer_name?: string | null;
}

export interface InboundCommitContext {
  /** line_user_id 等から解決済みの既知顧客 ID。未知なら null。 */
  knownCustomerId: string | null;
}

export type InboundCommitReason =
  | "ok"
  | "auto_create_off"
  | "intent_not_new"
  | "low_confidence"
  | "unknown_customer"
  | "no_valid_date";

export interface InboundCommitDecision {
  /** 予約を自動起票してよいか。 */
  create: boolean;
  reason: InboundCommitReason;
}

/**
 * 抽出結果から「予約を自動起票してよいか」を判定する。
 *
 * すべて満たすときだけ create=true:
 *   1. auto_create_reservation が opt-in 済み (resolveAutoAction)
 *   2. intent === "new_reservation" (変更/キャンセル/問い合わせは自動起票しない)
 *   3. confidence ≥ confidenceThreshold
 *   4. 既知顧客に紐づく — 壁3: 新規顧客(本人)の自動作成はしない
 *   5. 有効な希望日 (YYYY-MM-DD) がある
 */
export function decideInboundCommit(
  settings: AiAutomationSettings,
  extraction: InboundExtractionLike,
  ctx: InboundCommitContext,
): InboundCommitDecision {
  if (!resolveAutoAction(settings, "inbound_message.auto_create_reservation")) {
    return { create: false, reason: "auto_create_off" };
  }
  const intent = (extraction.intent ?? "").toLowerCase();
  if (intent !== "new_reservation") {
    return { create: false, reason: "intent_not_new" };
  }
  const conf = typeof extraction.confidence === "number" ? extraction.confidence : 0;
  if (conf < settings.confidenceThreshold) {
    return { create: false, reason: "low_confidence" };
  }
  if (!ctx.knownCustomerId) {
    return { create: false, reason: "unknown_customer" };
  }
  if (!isValidYmd(extraction.scheduled_date)) {
    return { create: false, reason: "no_valid_date" };
  }
  return { create: true, reason: "ok" };
}

// ─────────────────────────────────────────────
// 証明書ドラフト / 発行
// ─────────────────────────────────────────────

export interface CertificateAutoDraftContext {
  /** 案件 (予約) が完了済みか。 */
  isCompleted: boolean;
  /** 下書きの素になる車両情報が紐づいているか。 */
  hasVehicle: boolean;
  /** 既にドラフト生成済みか (二重生成 / スタッフ編集の上書き防止)。 */
  alreadyDrafted?: boolean;
}

/**
 * 案件完了時に証明書ドラフトを自動生成してよいか。
 *
 * ドラフト生成のみ (発行はしない) なので安全。draftCertificate は車両 + 過去事例
 * から生成するため、トリガーは「完了 + 車両あり + 未生成」。写真は生成に使わない
 * (現状 generateCertificateDraft は photoDescriptions 未使用)。
 */
export function shouldAutoDraftCertificate(settings: AiAutomationSettings, ctx: CertificateAutoDraftContext): boolean {
  if (!resolveAutoAction(settings, "certificate.auto_draft")) return false;
  if (ctx.alreadyDrafted) return false;
  return ctx.isCompleted && ctx.hasVehicle;
}

/**
 * 壁3: 証明書の「発行」は法的責任を伴うため決して自動化しない。
 * NEVER_AUTO_ACTIONS により resolveAutoAction は常に false を返す。
 * (明示的に呼べるようにして、意図を tests/コードで固定する)
 */
export function canAutoIssueCertificate(settings: AiAutomationSettings): boolean {
  return resolveAutoAction(settings, "certificate.auto_issue");
}

// ─────────────────────────────────────────────
// レビュー (受領サイン後の顧客レビュー)
// ─────────────────────────────────────────────

/**
 * レビュー受信時に感情分析を自動実行してよいか。
 * 解析結果は注釈 (sentiment / summary / topics) としてのみ保存され、
 * 金額・本人確認・法的確定には関与しない (非壁3)。
 */
export function shouldAutoAnalyzeReview(settings: AiAutomationSettings): boolean {
  return resolveAutoAction(settings, "review.auto_analyze");
}

// ─────────────────────────────────────────────
// 帳票 (請求書 / 見積書) の確定 → 自動送付
// ─────────────────────────────────────────────

/**
 * 「確定 (人が draft→sent に変更)」した帳票を顧客へ自動送付してよいか。
 *
 * 壁3 との整合:
 *   - 金額/内容の **確定そのもの** は人が行う (draft→sent は人の操作)。
 *     ここで自動化するのは「確定後の送付」のみ。
 *   - 人の確認を一切挟まない無ゲート送付 (`invoice.auto_send` / `quote.auto_send`) は
 *     NEVER_AUTO_ACTIONS のままで、常に false。
 *
 * doc_type に応じて opt-in アクションキーを引き当てて判定する。
 * 送付対象でない doc_type (見積/請求以外) は常に false。
 */
export function shouldAutoSendDocument(settings: AiAutomationSettings, docType: string): boolean {
  if (docType === "invoice" || docType === "consolidated_invoice") {
    return resolveAutoAction(settings, "invoice.auto_send_on_confirm");
  }
  if (docType === "estimate") {
    return resolveAutoAction(settings, "quote.auto_send_on_confirm");
  }
  return false;
}

// ─────────────────────────────────────────────
// 証明書ドラフト「レコード」自動作成 (draft 行を起票)
// ─────────────────────────────────────────────

export interface CertificateAutoCreateContext {
  /** 案件 (予約) が完了済みか。 */
  isCompleted: boolean;
  /** 証明書の素になる車両情報が紐づいているか。 */
  hasVehicle: boolean;
  /** 既にこの案件 / 車両で証明書が存在するか (二重起票防止)。 */
  alreadyHasCertificate?: boolean;
}

/**
 * 案件完了時に証明書を status=draft の「行」として自動作成してよいか。
 *
 * 壁3 との整合:
 *   - 作るのは **下書き (draft) のみ**。発行 (draft→active = 法的確定) は必ず人。
 *     `certificate.auto_issue` は NEVER_AUTO_ACTIONS のままで常に false。
 *   - 既に証明書がある案件には作らない (スタッフの手作業を尊重)。
 */
export function shouldAutoCreateDraftCertificate(
  settings: AiAutomationSettings,
  ctx: CertificateAutoCreateContext,
): boolean {
  if (!resolveAutoAction(settings, "certificate.auto_create_draft_record")) return false;
  if (ctx.alreadyHasCertificate) return false;
  return ctx.isCompleted && ctx.hasVehicle;
}

// ─────────────────────────────────────────────
// 会計科目の自動推定 (案件登録時)
// ─────────────────────────────────────────────

/**
 * 案件 (予約) 登録時に勘定科目を自動推定してよいか。
 * 推定結果は「提案」として保存されるだけで、帳簿への計上 (確定) は行わない。
 * 金額・科目の確定は必ず人が行う (壁3: accounting.category は NEVER_AUTO_FIELD)。
 */
export function shouldAutoCategorizeAccountingOnIntake(settings: AiAutomationSettings): boolean {
  return resolveAutoAction(settings, "accounting.auto_categorize_on_intake");
}

// ─────────────────────────────────────────────
// 塗膜厚レポート → 異常検知
// ─────────────────────────────────────────────

/**
 * 塗膜厚レポート受信時に異常検知を自動実行してよいか。
 * 結果は注釈 (stats / severity / comment) としてのみ保存され、
 * 金額・本人確認・法的確定には関与しない (非壁3)。
 */
export function shouldAutoDetectThickness(settings: AiAutomationSettings): boolean {
  return resolveAutoAction(settings, "thickness.auto_detect");
}

// ─────────────────────────────────────────────
// 案件 (予約) 登録時 → ワークフロー提案
// ─────────────────────────────────────────────

/**
 * 案件登録時にワークフローテンプレートを AI 提案してよいか。
 * 提案は保存されるだけで自動適用しない (テンプレートの適用 = 進行開始は人が判断)。
 * 金額・本人確認・法的確定に関与しないため非壁3。
 */
export function shouldAutoProposeWorkflowOnIntake(settings: AiAutomationSettings): boolean {
  return resolveAutoAction(settings, "workflow.auto_propose_on_intake");
}

/**
 * 受付時に AI 提案のワークフローを自動適用するか。
 * 提案 (auto_propose) が前提 — 提案が無ければ適用するものが無い。
 */
export function shouldAutoApplyWorkflowOnIntake(settings: AiAutomationSettings): boolean {
  return resolveAutoAction(settings, "workflow.auto_apply_on_intake");
}

/** ワークフローの会計/請求工程で請求書ドラフトを自動作成するか（送付は壁3で人）。 */
export function shouldAutoDraftInvoiceOnBilling(settings: AiAutomationSettings): boolean {
  return resolveAutoAction(settings, "invoice.auto_draft_on_billing_step");
}

// ─────────────────────────────────────────────
// 在庫下限割れ → 発注書ドラフト自動作成
// ─────────────────────────────────────────────

/**
 * 在庫が下限を切ったとき発注書を draft として自動起票してよいか。
 *
 * 壁3 との整合:
 *   - 作るのは **下書き (draft) のみ**。発注の承認・送信 (仕入先への金額コミット) は
 *     必ず人が行う。自動で発注を確定・外部送信することはしない。
 */
export function shouldAutoDraftReorder(settings: AiAutomationSettings): boolean {
  return resolveAutoAction(settings, "inventory.auto_draft_reorder");
}

// ─────────────────────────────────────────────
// 証明書写真 → 改ざんスクリーニング
// ─────────────────────────────────────────────

/**
 * 証明書写真のアップロード時に改ざんスクリーニングを自動実行してよいか。
 * 結果は注釈 (verdict / flags) としてのみ保存され、発行・金額・本人確認には
 * 関与しない (非壁3)。
 */
export function shouldAutoTamperingCheck(settings: AiAutomationSettings): boolean {
  return resolveAutoAction(settings, "photo.auto_tampering_check");
}

// ─────────────────────────────────────────────
// 保険案件 (claim) → 不正リスク自動スコア
// ─────────────────────────────────────────────

/**
 * 保険案件の受信時に不正リスクを自動スコアしてよいか。
 * 結果は注釈 (risk_level / flags) としてのみ保存され、査定の確定は人が行う
 * (リスク提示のみ・非壁3)。
 */
export function shouldAutoFraudScore(settings: AiAutomationSettings): boolean {
  return resolveAutoAction(settings, "insurer_case.auto_fraud_score");
}
