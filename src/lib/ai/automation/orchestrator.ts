/**
 * イベント駆動オーケストレーションの「判定」層 (純関数のみ)。
 *
 * 「人がフォームを開かなくてもワークフローを前に進めてよいか」を、
 * テナント設定 (AiAutomationSettings) と抽出結果・文脈から決める。
 * 実際の DB 書き込み (IO) は inboundAuto.ts など呼び出し側が行う。
 *
 * 全アクションが opt-in 可能。安全性は confidence_threshold と
 * Pro プラン要件で担保する。
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
 * 抽出は「提案を先回りで用意するだけ」でコミットしないため安全。
 */
export function shouldAutoExtractInbound(settings: AiAutomationSettings): boolean {
  return resolveAutoAction(settings, "inbound_message.auto_extract");
}

/**
 * 顧客への LINE 紐づけ完了時に、過去メッセージから予約候補を一括抽出してよいか。
 * 抽出は「候補を ai_extracted に保存するだけ」でコミット (予約作成) しないため安全。
 */
export function shouldAutoImportHistoryOnLink(settings: AiAutomationSettings): boolean {
  return resolveAutoAction(settings, "inbound_message.auto_import_history_on_link");
}

/**
 * 受信メッセージ (価格問い合わせ等) から見積ドラフトを自動起票してよいか。
 * ドラフト作成のみで送付はしない (送付は quote.auto_send_on_confirm が別途担う)。
 */
export function shouldAutoDraftQuoteFromInbound(settings: AiAutomationSettings): boolean {
  return resolveAutoAction(settings, "quote.auto_draft_from_inbound");
}

/**
 * 受信メッセージ (価格問い合わせ) に概算見積りを LINE で自動返信してよいか。
 * 顧客へ外向きに金額を送るが、送るのは「概算・要来店」の但し書き付きレンジのみ。
 * 正式・詳細な見積りは案内文で来店に誘導する (quote.auto_reply_rough_estimate)。
 */
export function shouldAutoReplyRoughEstimate(settings: AiAutomationSettings): boolean {
  return resolveAutoAction(settings, "quote.auto_reply_rough_estimate");
}

/**
 * 受信メッセージ (一般質問) に店舗ナレッジで LINE 自動返信してよいか。
 * 顧客へ外向きにテキストを送るが、回答ソースはテナント管理者が登録した
 * ナレッジのみ (AI がナレッジ外の内容を創作しないことを生成側で強制する)。
 */
export function shouldAutoReplyKnowledge(settings: AiAutomationSettings): boolean {
  return resolveAutoAction(settings, "inbound_message.auto_reply_knowledge");
}

/**
 * 受信メッセージ (価格問い合わせ) を起点に、複数ターンの会話フロー (見積り→可否→
 * 日程調整…) を LINE で自動進行してよいか。会話を状態機械で保持し顧客の OK/NG や
 * ボタン選択で分岐する (line_conversation_flows)。金額の外向き確定 (正式見積書・
 * 請求書の送付) は各既存アクションの opt-in と人の 1 タップを引き続き尊重する。
 */
export function shouldRunConversationFlow(settings: AiAutomationSettings): boolean {
  return resolveAutoAction(settings, "inbound_message.auto_conversation_flow");
}

/** 顧客が LINE で予約を自分でキャンセルできるか (inbound_message.auto_self_cancel)。 */
export function shouldAutoSelfCancel(settings: AiAutomationSettings): boolean {
  return resolveAutoAction(settings, "inbound_message.auto_self_cancel");
}

/** 顧客が LINE で予約の日程を自分で変更できるか (inbound_message.auto_self_reschedule)。 */
export function shouldAutoSelfReschedule(settings: AiAutomationSettings): boolean {
  return resolveAutoAction(settings, "inbound_message.auto_self_reschedule");
}

/** 予約前日リマインダーを LINE で自動送信するか (reservation.auto_day_before_reminder)。 */
export function shouldSendDayBeforeReminder(settings: AiAutomationSettings): boolean {
  return resolveAutoAction(settings, "reservation.auto_day_before_reminder");
}

/** 停滞した見積り会話フローに再促し (nudge) を送るか (inbound_message.auto_flow_nudge)。 */
export function shouldNudgeStalledFlows(settings: AiAutomationSettings): boolean {
  return resolveAutoAction(settings, "inbound_message.auto_flow_nudge");
}

/** スタッフの LINE 返信から FAQ 候補を自動抽出しレビュー待ちに積むか (inbound_message.auto_capture_knowledge)。 */
export function shouldCaptureKnowledge(settings: AiAutomationSettings): boolean {
  return resolveAutoAction(settings, "inbound_message.auto_capture_knowledge");
}

/** 一定時間返信が無い LINE スレッドをスタッフに通知するか (inbound_message.auto_unanswered_alert)。 */
export function shouldAlertUnansweredThreads(settings: AiAutomationSettings): boolean {
  return resolveAutoAction(settings, "inbound_message.auto_unanswered_alert");
}

/** 予約・作業の状況問い合わせに LINE で自動返信するか (inbound_message.auto_status_reply)。 */
export function shouldAutoReplyStatus(settings: AiAutomationSettings): boolean {
  return resolveAutoAction(settings, "inbound_message.auto_status_reply");
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
  | "ok_with_new_customer"
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
 *   4. 既知顧客に紐づく、または customer.auto_create が有効で名前が抽出できている
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
    if (!resolveAutoAction(settings, "customer.auto_create")) {
      return { create: false, reason: "unknown_customer" };
    }
    if (!extraction.customer_name?.trim()) {
      return { create: false, reason: "unknown_customer" };
    }
  }
  if (!isValidYmd(extraction.scheduled_date)) {
    return { create: false, reason: "no_valid_date" };
  }
  return { create: true, reason: ctx.knownCustomerId ? "ok" : "ok_with_new_customer" };
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
 * 証明書の「発行」(draft→active) を自動実行してよいか。
 * opt-in + 全条件通過時のみ true。
 */
export function canAutoIssueCertificate(settings: AiAutomationSettings): boolean {
  return resolveAutoAction(settings, "certificate.auto_issue");
}

export interface CertificateAutoIssueContext {
  hasDraft: boolean;
  photoQualityPassed: boolean;
  tamperingCheckPassed: boolean;
  hasRequiredFields: boolean;
  confidence: number;
}

/**
 * 証明書ドラフトを自動発行 (draft→active) してよいか。
 *
 * opt-in + 全品質チェック通過 + 必須項目充足 + confidence 閾値以上。
 */
export function shouldAutoIssueCertificate(settings: AiAutomationSettings, ctx: CertificateAutoIssueContext): boolean {
  if (!canAutoIssueCertificate(settings)) return false;
  if (!ctx.hasDraft) return false;
  if (!ctx.photoQualityPassed || !ctx.tamperingCheckPassed) return false;
  if (!ctx.hasRequiredFields) return false;
  return ctx.confidence >= settings.confidenceThreshold;
}

// ─────────────────────────────────────────────
// レビュー (受領サイン後の顧客レビュー)
// ─────────────────────────────────────────────

/**
 * レビュー受信時に感情分析を自動実行してよいか。
 * 解析結果は注釈 (sentiment / summary / topics) としてのみ保存され、
 * 金額・本人確認・法的確定には関与しない。
 */
export function shouldAutoAnalyzeReview(settings: AiAutomationSettings): boolean {
  return resolveAutoAction(settings, "review.auto_analyze");
}

// ─────────────────────────────────────────────
// 帳票 (請求書 / 見積書) の確定 → 自動送付
// ─────────────────────────────────────────────

/**
 * 人が draft→sent に確定した後の自動送付 (on_confirm) を行うか。
 * maybeAutoSendDocumentOnConfirm (documentAuto.ts) 用。
 */
export function shouldAutoSendDocumentOnConfirm(settings: AiAutomationSettings, docType: string): boolean {
  if (docType === "invoice" || docType === "consolidated_invoice") {
    return resolveAutoAction(settings, "invoice.auto_send_on_confirm");
  }
  if (docType === "estimate") {
    return resolveAutoAction(settings, "quote.auto_send_on_confirm");
  }
  return false;
}

/**
 * 人の確認なしで自動送付 (ungated) を行うか。
 * 無ゲート送付ワークフロー用。on_confirm とは独立した判定。
 */
export function shouldAutoSendDocumentUngated(settings: AiAutomationSettings, docType: string): boolean {
  if (docType === "invoice" || docType === "consolidated_invoice") {
    return resolveAutoAction(settings, "invoice.auto_send");
  }
  if (docType === "estimate") {
    return resolveAutoAction(settings, "quote.auto_send");
  }
  return false;
}

/**
 * 請求書の金額を自動確定 (draft→sent) してよいか (人の確認なし)。
 * opt-in 時のみ true。金額妥当性チェックは呼び出し側で実施する。
 */
export function shouldAutoFinalizeInvoice(settings: AiAutomationSettings): boolean {
  return resolveAutoAction(settings, "invoice.auto_finalize");
}

/**
 * 確定済み請求に対して自動課金 (Stripe) してよいか。
 * opt-in 時のみ true。決済手段の有無・猶予期間は呼び出し側で検証する。
 */
export function shouldAutoCharge(settings: AiAutomationSettings): boolean {
  return resolveAutoAction(settings, "payment.auto_charge");
}

/**
 * 受信メッセージから新規顧客を自動作成してよいか。
 * opt-in 時のみ true。名寄せ (重複チェック) は呼び出し側で実施する。
 */
export function shouldAutoCreateCustomer(settings: AiAutomationSettings): boolean {
  return resolveAutoAction(settings, "customer.auto_create");
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
 * certificate.auto_issue が有効な場合は後続で自動発行される。
 * 既に証明書がある案件には作らない (スタッフの手作業を尊重)。
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
 * auto ポリシーなら科目の自動確定も可能。
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
 * 金額・本人確認・法的確定には関与しない。
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

/** ワークフローの会計/請求工程で請求書ドラフトを自動作成するか。 */
export function shouldAutoDraftInvoiceOnBilling(settings: AiAutomationSettings): boolean {
  return resolveAutoAction(settings, "invoice.auto_draft_on_billing_step");
}

/** 案件完了 (status=completed) 時に請求書ドラフトを自動作成するか (会計工程とは別 opt-in)。 */
export function shouldAutoDraftInvoiceOnCompletion(settings: AiAutomationSettings): boolean {
  return resolveAutoAction(settings, "invoice.auto_draft_on_completion");
}

/**
 * 案件のステータス遷移時に「次アクション」を自動提案してよいか。
 * 結果は提案 (action/message/priority) として保存されるだけで、各操作の実行は人が行う
 * (提案のみ・非壁3)。
 */
export function shouldAutoNextAction(settings: AiAutomationSettings): boolean {
  return resolveAutoAction(settings, "job.auto_next_action");
}

/**
 * 案件登録時に担当メカニックの候補を自動提案してよいか。
 * 結果は提案 (candidates) として保存されるだけで、担当の割当 (確定) は人が行う
 * (提案のみ・自動割当しない・非壁3)。保険案件の auto_assign_suggest と同じ思想。
 */
export function shouldAutoSuggestMechanic(settings: AiAutomationSettings): boolean {
  return resolveAutoAction(settings, "mechanic.auto_assign_suggest");
}

// ─────────────────────────────────────────────
// 在庫下限割れ → 発注書ドラフト自動作成
// ─────────────────────────────────────────────

/**
 * 在庫が下限を切ったとき発注書を draft として自動起票してよいか。
 *
 * 作るのは下書き (draft)。発注の承認・送信は別途 opt-in で自動化可能。
 */
export function shouldAutoDraftReorder(settings: AiAutomationSettings): boolean {
  return resolveAutoAction(settings, "inventory.auto_draft_reorder");
}

/**
 * 納品書アップロード時に AI-OCR + 三方照合を自動実行してよいか。
 * 結果は検知 (part_integrity_findings) の注釈のみで、確定署名・アンカー・在庫計上には
 * 関与しない。
 */
export function shouldAutoReconcileDeliveryNote(settings: AiAutomationSettings): boolean {
  return resolveAutoAction(settings, "parts.auto_reconcile_delivery_note");
}

// ─────────────────────────────────────────────
// 証明書写真 → 改ざんスクリーニング
// ─────────────────────────────────────────────

/**
 * 証明書写真のアップロード時に改ざんスクリーニングを自動実行してよいか。
 * 結果は注釈 (verdict / flags) としてのみ保存され、発行・金額・本人確認には
 * 関与しない。
 */
export function shouldAutoTamperingCheck(settings: AiAutomationSettings): boolean {
  return resolveAutoAction(settings, "photo.auto_tampering_check");
}

/**
 * 証明書写真のアップロード時に品質・抜け漏れスクリーニングを自動実行してよいか。
 * 結果はスコア / 指摘の注釈としてのみ保存され、発行のブロックや金額・本人確認には
 * 関与しない。
 */
export function shouldAutoQualityCheck(settings: AiAutomationSettings): boolean {
  return resolveAutoAction(settings, "photo.auto_quality_check");
}

/**
 * 施工写真アップロード時に before/after 分類を自動実行してよいか。
 * 結果は提案 (meta.stage_suggestions) の注釈のみで、stage の確定・発行ゲートには
 * 関与しない (提案のみ・非壁3)。
 */
export function shouldAutoClassifyStage(settings: AiAutomationSettings): boolean {
  return resolveAutoAction(settings, "photo.auto_classify_stage");
}

/**
 * 施工写真アップロード時に「写真打刻」(EXIF 撮影時刻 → 施工日 / 作業時間) を自動導出して
 * よいか。結果は提案 (meta.work_stamp) の注釈のみで、フォームへの反映・発行・金額には
 * 関与しない (提案のみ・非壁3・LLM 不使用でコスト無し)。
 */
export function shouldAutoWorkStamp(settings: AiAutomationSettings): boolean {
  return resolveAutoAction(settings, "photo.auto_work_stamp");
}

/**
 * 施工写真アップロード時に「施工内容ドラフト」を AI Vision で自動生成してよいか。
 * 結果は提案（meta.content_draft_suggestion）の注釈のみで、施工内容欄への反映・発行・
 * 金額には関与しない（提案のみ・非壁3）。
 */
export function shouldAutoDraftContent(settings: AiAutomationSettings): boolean {
  return resolveAutoAction(settings, "photo.auto_draft_content");
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

/**
 * 保険案件の受信時に 3 行サマリを自動生成してよいか。
 * 結果は注釈 (lines / confidence) としてのみ保存され、査定の確定は人が行う
 * (要点提示のみ・非壁3)。
 */
export function shouldAutoSummarizeCase(settings: AiAutomationSettings): boolean {
  return resolveAutoAction(settings, "insurer_case.auto_summary");
}

/**
 * 保険案件の受信時に担当者候補を自動提案してよいか。
 * 結果は注釈 (candidates) としてのみ保存され、割当 (確定) は人が行う
 * (提案のみ・非壁3)。ルールで自動割当済みの案件には提案しない (呼び出し側で判定)。
 */
export function shouldAutoSuggestAssignee(settings: AiAutomationSettings): boolean {
  return resolveAutoAction(settings, "insurer_case.auto_assign_suggest");
}

// ─────────────────────────────────────────────
// 顧客問い合わせ → 自動分類 / 返信下書き
// ─────────────────────────────────────────────

/**
 * 問い合わせ受信時に分類 + 返信下書きを自動生成してよいか。
 * 結果は注釈 (category / priority / draft_reply) としてのみ保存され、返信の送信は
 * 必ず人が行う (下書き・分類のみ・非壁3)。
 */
export function shouldAutoClassifyInquiry(settings: AiAutomationSettings): boolean {
  return resolveAutoAction(settings, "inquiry.auto_classify");
}

// ─────────────────────────────────────────────
// LINE会話フロー由来の予約 → 入庫日の車検証撮影依頼・自動登録
// ─────────────────────────────────────────────

/**
 * LINE 会話フロー経由で確定した予約について、入庫日に車検証撮影を依頼し、
 * 受け取った写真から車両を自動登録してよいか。既存の証明書自動化 (vehicle_id
 * が付けば動く) を働かせるための前段。写真を受け取れず OCR に失敗した場合は
 * 人に引き継ぐため安全 (勝手に車種を作らない)。
 */
export function shouldAutoCaptureVehicleViaLine(settings: AiAutomationSettings): boolean {
  return resolveAutoAction(settings, "vehicle.auto_capture_via_line");
}
