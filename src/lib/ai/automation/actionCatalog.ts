/**
 * AI 自動「アクション」カタログ — single source of truth。
 *
 * fieldCatalog.ts が「フィールドを AI が埋めるか」を制御するのに対し、
 * このカタログは「人がトリガーを引かなくてもワークフローを前に進めるか」
 * (= イベント駆動の自動実行) を制御する。
 *
 * 用語:
 *   - **auto-action**: 受信 webhook / 状態遷移などをきっかけに、人の操作なしで
 *     AI 処理 (抽出・下書き生成・自動起票) を走らせること。
 *   - **NEVER_AUTO_ACTIONS (壁3)**: 法的責任・金額の外向き確定を伴うため、
 *     テナントが設定で true にしても **絶対に自動実行しない** アクション。
 *     必ず人の最終確認を挟む。`resolveAutoAction` (policy.ts) がここを強制する。
 *
 * 設計方針:
 *   - すべての auto-action は **デフォルト OFF** (defaultEnabled=false)。
 *     既存テナントの挙動を勝手に変えない。管理者が明示的に opt-in して初めて
 *     自動実行される ("AI が提案、人が承認" という既存の保守的デフォルトと整合)。
 *   - キーは `tenant_ai_automation_settings.auto_actions` に永続化される。
 *     rename は移行を伴うので不可。追加は末尾に。
 *   - ピュアデータモジュール (no JSX, no server-only import)。
 */

import type { AutomationWorkflowKey } from "./fieldCatalog";

/** opt-in 可能な auto-action のキー。 */
export type AutomationActionKey =
  | "inbound_message.auto_extract"
  | "inbound_message.auto_create_reservation"
  | "inbound_message.auto_import_history_on_link"
  | "certificate.auto_draft"
  | "certificate.auto_create_draft_record"
  | "certificate.auto_issue"
  | "review.auto_analyze"
  | "translation.auto_translate"
  | "invoice.auto_send_on_confirm"
  | "invoice.auto_send"
  | "invoice.auto_finalize"
  | "quote.auto_send_on_confirm"
  | "quote.auto_send"
  | "quote.auto_draft_from_inbound"
  | "quote.auto_reply_rough_estimate"
  | "accounting.auto_categorize_on_intake"
  | "invoice.auto_draft_on_billing_step"
  | "invoice.auto_draft_on_completion"
  | "thickness.auto_detect"
  | "workflow.auto_propose_on_intake"
  | "workflow.auto_apply_on_intake"
  | "mechanic.auto_assign_suggest"
  | "job.auto_next_action"
  | "inventory.auto_draft_reorder"
  | "parts.auto_reconcile_delivery_note"
  | "photo.auto_tampering_check"
  | "photo.auto_quality_check"
  | "photo.auto_classify_stage"
  | "photo.auto_work_stamp"
  | "photo.auto_draft_content"
  | "insurer_case.auto_fraud_score"
  | "insurer_case.auto_summary"
  | "insurer_case.auto_assign_suggest"
  | "inquiry.auto_classify"
  | "customer.auto_create"
  | "payment.auto_charge"
  | "body_repair.auto_notify_on_stage_advance"
  | "inbound_message.auto_reply_knowledge"
  | "inbound_message.auto_conversation_flow"
  | "manager.auto_daily_digest"
  | "vehicle.auto_capture_via_line"
  | "inbound_message.auto_self_cancel"
  | "inbound_message.auto_self_reschedule"
  | "reservation.auto_day_before_reminder"
  | "inbound_message.auto_status_reply"
  | "inbound_message.auto_flow_nudge"
  | "inbound_message.auto_capture_knowledge"
  | "inbound_message.auto_unanswered_alert";

export interface AutomationActionDef {
  key: AutomationActionKey;
  workflow: AutomationWorkflowKey;
  label: string;
  description: string;
  /** 既定は必ず false (opt-in)。 */
  defaultEnabled: false;
  /**
   * このアクションが自動コミットする際、追加で満たすべき前提の説明 (UI 用)。
   * 実際のガードは orchestrator / inboundAuto 側で実装する。
   */
  guard?: string;
}

export const AUTOMATION_ACTIONS: readonly AutomationActionDef[] = [
  {
    key: "inbound_message.auto_extract",
    workflow: "inbound_message",
    label: "受信メッセージを自動でAI抽出",
    description:
      "LINE 等で顧客メッセージを受信した時点で予約候補を自動抽出し、受信箱に下書きとして用意する。作成・送信は行わないため安全 (人は1タップで確定)。",
    defaultEnabled: false,
    guard: "AI 有効 + Standard プラン以上 + confidence 閾値",
  },
  {
    key: "inbound_message.auto_create_reservation",
    workflow: "inbound_message",
    label: "受信メッセージから予約を自動起票",
    description:
      "予約意図かつ高確信、さらに既知顧客に紐づく場合のみ予約を自動作成する。新規顧客 (本人確認) の自動作成はしない。タイトルに【要確認】を付与。",
    defaultEnabled: false,
    guard: "intent=new_reservation + confidence≥閾値 + 既知顧客 + 有効な希望日",
  },
  {
    key: "inbound_message.auto_import_history_on_link",
    workflow: "inbound_message",
    label: "顧客にLINEを紐づけたら過去のやり取りから予定を一括取り込み",
    description:
      "未紐づけのまま溜まっていた LINE のやり取りを、顧客への紐づけ完了時にまとめて AI 解析し、予約候補 (受信箱・顧客画面の下書き) を一括で用意する。予約の自動作成は行わず候補提示のみのため安全 (人は1タップで確定)。件数上限とコストキャップを尊重する。",
    defaultEnabled: false,
    guard: "AI 有効 + Standard プラン以上 + confidence 閾値",
  },
  {
    key: "certificate.auto_draft",
    workflow: "certificate",
    label: "写真・音声が揃ったら証明書ドラフトを自動生成",
    description:
      "案件に施工写真と音声メモが揃った時点で証明書の下書きを自動生成する。発行 (法的確定) は行わない — 発行は必ず人が確認する (壁3)。",
    defaultEnabled: false,
    guard: "写真あり + 音声メモあり + confidence≥閾値",
  },
  {
    key: "certificate.auto_create_draft_record",
    workflow: "certificate",
    label: "案件完了で証明書を下書き(draft)として自動作成",
    description:
      "案件完了 + 車両ありの時点で、AI 下書きを基に証明書レコードを status=draft で自動作成し発行直前まで用意する。発行 (draft→active = 法的確定) は必ず人が 1 タップで行う (壁3)。既に証明書がある案件は作らない。",
    defaultEnabled: false,
    guard: "AI 有効 + Standard プラン以上 + 案件完了 + 車両あり + 既存証明書なし",
  },
  {
    key: "review.auto_analyze",
    workflow: "review",
    label: "レビュー受信時に感情分析を自動実行",
    description: "レビュー / NPS を受信した時点でセンチメントと要約を自動付与する。注釈用途のため安全。",
    defaultEnabled: false,
  },
  {
    key: "translation.auto_translate",
    workflow: "translation",
    label: "お知らせ保存時に多言語へ自動翻訳",
    description: "店舗お知らせを保存した時点で英・中・越へ自動翻訳する (翻訳キャッシュ利用)。",
    defaultEnabled: false,
  },
  {
    key: "invoice.auto_send_on_confirm",
    workflow: "invoice",
    label: "請求書を確定したら自動送付",
    description:
      "下書きの請求書を人が「確定 (送付済みに変更)」した時点で、顧客に自動送付する。LINE 連携があれば LINE、無ければメールを自動選択し、決済リンク (Stripe Connect) と書類の両方を届ける。金額の確定そのものは必ず人が行う (壁3)。",
    defaultEnabled: false,
    guard: "AI 有効 + Standard プラン以上 + 人が draft→sent に確定 + 顧客に LINE もしくはメールあり",
  },
  {
    key: "quote.auto_draft_from_inbound",
    workflow: "quote",
    label: "受信メッセージから見積ドラフトを自動起票",
    description:
      "「ヴェルファイアのコーティングいくら？」のような価格問い合わせを受信した時点で、車両・過去の請求実績から見積書の下書きを自動生成する。送付はしない — 金額の確定・送付は必ず人が行う (下の「確定したら自動送付」と組み合わせると確定1タップで送付まで完了)。",
    defaultEnabled: false,
    guard:
      "AI 有効 + Standard プラン以上 + 既知顧客 + 施工内容と車両が読み取れた場合のみ / 24時間以内の重複起票はスキップ",
  },
  {
    key: "quote.auto_send_on_confirm",
    workflow: "quote",
    label: "見積書を確定したら自動送付",
    description:
      "下書きの見積書を人が「確定 (送付済みに変更)」した時点で、顧客に自動送付する。LINE 連携があれば LINE、無ければメールを自動選択して書類リンクを届ける。内容の確定そのものは必ず人が行う (壁3)。",
    defaultEnabled: false,
    guard: "AI 有効 + Standard プラン以上 + 人が draft→sent に確定 + 顧客に LINE もしくはメールあり",
  },
  {
    key: "accounting.auto_categorize_on_intake",
    workflow: "accounting",
    label: "案件登録時に勘定科目を自動推定(提案)",
    description:
      "案件 (予約) が登録された時点で、メニュー明細から freee / マネーフォワード の勘定科目を自動推定し、提案として保存する。確定 (帳簿への計上) は行わない — 金額・科目の確定は必ず人が行う (壁3)。",
    defaultEnabled: false,
    guard: "AI 有効 + Standard プラン以上 + 会計連携設定済み + メニュー明細あり",
  },
  {
    key: "invoice.auto_draft_on_billing_step",
    workflow: "invoice",
    label: "ワークフローの会計工程で請求書ドラフトを自動作成",
    description:
      "ワークフローが「会計/請求」工程に到達した時点で、予約のメニュー（無ければ見積額）から請求書を status=draft で自動起票する。送付（金額の外向き確定）は必ず人が行う（壁3）。同じ顧客の下書きが既にあれば作らない。",
    defaultEnabled: false,
    guard: "AI 有効 + Standard プラン以上 + 顧客あり + 金額の手掛かりあり",
  },
  {
    key: "invoice.auto_draft_on_completion",
    workflow: "invoice",
    label: "案件完了時に請求書ドラフトを自動作成",
    description:
      "予約が「完了」になった時点で、予約のメニュー（無ければ見積額）から請求書を status=draft で自動起票する。ワークフローの会計工程を使わないテナント向け。送付（金額の外向き確定）は必ず人が行う（壁3）。同じ顧客の下書きが既にあれば作らない。",
    defaultEnabled: false,
    guard: "AI 有効 + Standard プラン以上 + 顧客あり + 金額の手掛かりあり",
  },
  {
    key: "thickness.auto_detect",
    workflow: "inventory",
    label: "塗膜厚レポート受信時に異常検知を自動実行",
    description:
      "NexPTG 等から塗膜厚レポートを受信した時点で統計的な異常検知 (外れ値 / 値域逸脱) を自動実行し、結果を注釈として保存する。金額・本人確認・法的確定に関与しないため安全。",
    defaultEnabled: false,
    guard: "AI 有効 + Standard プラン以上",
  },
  {
    key: "workflow.auto_propose_on_intake",
    workflow: "job",
    label: "案件登録時に最適なワークフローをAI提案",
    description:
      "案件 (予約) が登録された時点で、メニュー内容と顧客の過去施工履歴から最適なワークフローテンプレートを AI が提案する。提案を保存するだけで自動適用はしない — スタッフが承認 (または別テンプレートに変更) してから進行する (人が判断)。",
    defaultEnabled: false,
    guard: "AI 有効 + Standard プラン以上 + ワークフローテンプレート登録済み",
  },
  {
    key: "workflow.auto_apply_on_intake",
    workflow: "job",
    label: "案件登録時にAI提案のワークフローを自動適用",
    description:
      "AI 提案 (workflow.auto_propose_on_intake) の最有力テンプレートを案件に自動で割り当て、ワークフローを開始する。テンプレートを手で組まなくても工程が走る。割り当てるだけで各工程の進行・確定は人が行う。スタッフはいつでも別テンプレートへ変更可能。",
    defaultEnabled: false,
    guard: "AI 有効 + Standard プラン以上 + workflow.auto_propose_on_intake 有効 + 一致テンプレートあり",
  },
  {
    key: "mechanic.auto_assign_suggest",
    workflow: "job",
    label: "案件登録時に担当メカニックの候補を自動提案",
    description:
      "案件 (予約) が登録された時点で、メニュー内容から必要スキルを推定し、職人の得意スキル (staff_members.skills) と過去の同種施工の担当履歴から担当メカニック候補を AI が提案する。提案を保存するだけで自動割当はしない — 誰が施工するかの確定は必ずスタッフが 1 タップで行う (人が判断)。",
    defaultEnabled: false,
    guard: "AI 有効 + Standard プラン以上 (ai_job_assist) + 稼働中の職人 (staff_members) 登録済み + 未割当の案件",
  },
  {
    key: "job.auto_next_action",
    workflow: "job",
    label: "案件の状態が変わったら次アクションを自動提案",
    description:
      "案件 (予約) のステータスが進んだ時点で、現状況 (顧客/車両/証明書/請求) から「次に何をすべきか」を自動算出し、案件画面に提案として保存・即時表示する。提案のみで、各操作 (発行/請求/入金確認 等) の実行は人が行う。",
    defaultEnabled: false,
    guard: "AI 有効 + Standard プラン以上 (ai_job_assist) + job.next_action が manual でない",
  },
  {
    key: "inventory.auto_draft_reorder",
    workflow: "inventory",
    label: "在庫が下限を切ったら発注書ドラフトを自動作成",
    description:
      "日次の在庫チェックで現在庫が下限 (min_stock) を下回った品目について、仕入先ごとに発注書を status=draft で自動起票する。発注の承認・送信 (仕入先への金額コミット) は必ず人が行う — 自動で発注を確定・送信することはしない。",
    defaultEnabled: false,
    guard: "AI 有効 + Standard プラン以上 + 品目に仕入先 (supplier_id) が設定済み",
  },
  {
    key: "parts.auto_reconcile_delivery_note",
    workflow: "inventory",
    label: "納品書アップロード時に三方照合を自動実行",
    description:
      "部品装着レコードに納品書画像がアップロードされた時点で、AI-OCR で明細化し装着内容・数量と三方照合して不一致を自動検知 (part_integrity_findings に記録) する。検知 (注釈) のみで、確定署名・アンカー・在庫計上には関与しない (人の操作のまま)。",
    defaultEnabled: false,
    guard: "AI 有効 (master switch + 月次コストキャップ) + 納品書画像あり (source_policies.identity_documents)",
  },
  {
    key: "photo.auto_tampering_check",
    workflow: "certificate",
    label: "証明書写真の改ざんスクリーニングを自動実行",
    description:
      "施工写真がアップロードされた時点で、アップロード時に取得済みのシグナル (ハッシュ重複 / ディープフェイク判定 / 撮影メタ) を証明書単位の改ざん判定に集約し、注釈として保存する。発行・金額・本人確認には関与しないため安全 (人は発行前にフラグを確認できる)。",
    defaultEnabled: false,
    guard: "AI 有効 + Standard プラン以上 (ai_quality_vision)",
  },
  {
    key: "photo.auto_quality_check",
    workflow: "certificate",
    label: "証明書写真の品質・抜け漏れスクリーニングを自動実行",
    description:
      "施工写真がアップロードされた時点で、Ledra Standard 基準に照らした写真品質・枚数・記入項目の抜け漏れを自動審査し、スコアと指摘を注釈として保存する。発行・金額・本人確認には関与しないため安全 (人は発行前に確認できる)。発行のブロックはしない。",
    defaultEnabled: false,
    guard: "AI 有効 + Standard プラン以上 (ai_quality_vision) + 施工カテゴリ判定済み",
  },
  {
    key: "photo.auto_classify_stage",
    workflow: "certificate",
    label: "施工写真の施工前/施工後を自動分類",
    description:
      "施工写真がアップロードされた時点で、未タグ (stage 未設定) の写真を施工前/施工後に AI が自動分類し、提案として証明書に保存する。stage の確定 (書き換え) や発行の before/after ゲートには関与しない — 人が UI で提案を確認して確定する。注釈のみのため安全。",
    defaultEnabled: false,
    guard: "AI 有効 + Standard プラン以上 (ai_quality_vision) + 未タグの写真あり",
  },
  {
    key: "insurer_case.auto_fraud_score",
    workflow: "insurer_case",
    label: "保険案件の受信時に不正リスクを自動スコア",
    description:
      "保険案件 (claim) が作成された時点で、ルールベース一次判定 + グレーゾーンのみ AI で不正リスクを自動評価し、注釈として案件に保存する。査定の確定は必ず人が行う (リスク提示のみ・壁3 不介入)。",
    defaultEnabled: false,
    guard: "AI 有効 + 案件にテナント紐付けあり (証明書/車両/契約経由)",
  },
  {
    key: "insurer_case.auto_summary",
    workflow: "insurer_case",
    label: "保険案件の受信時に3行サマリを自動生成",
    description:
      "保険案件 (claim) が作成された時点で、車両 / 施工 / 本文から査定担当向けの 3 行サマリを自動生成し、注釈として案件に保存する。査定担当は案件を開いた瞬間に要点を把握できる。査定の確定は必ず人が行う (注釈のみ・壁3 不介入)。",
    defaultEnabled: false,
    guard: "AI 有効 + 案件にテナント紐付けあり (証明書/車両/契約経由)",
  },
  {
    key: "insurer_case.auto_assign_suggest",
    workflow: "insurer_case",
    label: "保険案件の受信時に担当者候補を自動提案",
    description:
      "保険案件 (claim) が作成され、かつ振り分けルールで自動割当されなかった時点で、過去の担当履歴 / specialty から担当者候補を自動提案し、注釈として案件に保存する。割当 (確定) は必ず人が行う — 提案のみで自動割当はしない。",
    defaultEnabled: false,
    guard: "AI 有効 + 案件にテナント紐付けあり + ルール未割当 + insurer ユーザー登録済み",
  },
  {
    key: "inquiry.auto_classify",
    workflow: "inquiry",
    label: "問い合わせ受信時に分類・返信下書きを自動生成",
    description:
      "顧客ポータルから問い合わせを受信した時点で、カテゴリ / 優先度 / 返信下書きを自動生成し、注釈として保存する。スタッフが受信箱を開いた瞬間に分類済み・下書き済みの状態にする。",
    defaultEnabled: false,
    guard: "AI 有効 + Standard プラン以上 (ai_inquiry_classify)",
  },
  // ── 旧・壁3 アクション (AI 精度向上により自動化解禁) ──
  {
    key: "certificate.auto_issue",
    workflow: "certificate",
    label: "証明書ドラフトを自動発行",
    description:
      "AI ドラフト作成済みの証明書を、confidence が閾値以上かつ必須フィールド充足時に status=active として自動発行する。写真品質・改ざんチェックが全パスしていることが前提。",
    defaultEnabled: false,
    guard: "AI 有効 + Pro プラン + confidence≥閾値 + 写真品質/改ざんチェック通過 + 必須項目充足",
  },
  {
    key: "invoice.auto_send",
    workflow: "invoice",
    label: "請求書を人の確認なしで自動送付",
    description:
      "請求書ドラフト作成後、内容の妥当性チェック (金額・顧客・明細) をパスした場合に自動で確定 (draft→sent) し顧客に送付する。LINE 連携があれば LINE、無ければメールを自動選択。",
    defaultEnabled: false,
    guard: "AI 有効 + Pro プラン + 金額妥当性チェック通過 + 顧客に送付チャネルあり",
  },
  {
    key: "invoice.auto_finalize",
    workflow: "invoice",
    label: "請求書の金額を自動確定",
    description:
      "ワークフローの会計工程で AI が生成した請求書ドラフトの金額を、メニュー価格・過去実績との照合で妥当と判断した場合に自動確定する。大幅な乖離がある場合は suggest に降格。",
    defaultEnabled: false,
    guard: "AI 有効 + Pro プラン + メニュー/見積との乖離率≤許容値",
  },
  {
    key: "quote.auto_send",
    workflow: "quote",
    label: "見積書を人の確認なしで自動送付",
    description:
      "見積書ドラフト作成後、内容の妥当性チェックをパスした場合に自動で確定 (draft→sent) し顧客に送付する。LINE 連携があれば LINE、無ければメールを自動選択。",
    defaultEnabled: false,
    guard: "AI 有効 + Pro プラン + 金額妥当性チェック通過 + 顧客に送付チャネルあり",
  },
  {
    key: "customer.auto_create",
    workflow: "inbound_message",
    label: "受信メッセージから新規顧客を自動作成",
    description:
      "LINE / メールで未知の顧客からメッセージを受信した時点で、AI 抽出した名前・連絡先から顧客レコードを自動作成する。既存顧客との名寄せ (fuzzy match) を行い、重複が検出された場合は作成せずマッチ候補を提示する。",
    defaultEnabled: false,
    guard: "AI 有効 + Pro プラン + confidence≥閾値 + 名寄せで重複なし",
  },
  {
    key: "payment.auto_charge",
    workflow: "invoice",
    label: "確定済み請求に対し自動課金",
    description:
      "確定済みの請求書に対し、顧客が登録済みの決済手段 (Stripe) で自動課金する。請求確定後の一定期間 (猶予期間) 経過後に実行される。課金失敗時はスタッフに通知し手動対応に切り替わる。",
    defaultEnabled: false,
    guard: "AI 有効 + Pro プラン + Stripe Connect + 顧客に決済手段登録済み + 猶予期間経過",
  },
  {
    key: "body_repair.auto_notify_on_stage_advance",
    workflow: "job",
    label: "鈑金の工程が進んだら顧客へ自動通知",
    description:
      "鈑金 Kanban の工程ステージ (受付 → 協定 → 鈑金 → 塗装 → 完成 → 出庫) が進むたび、顧客へ LINE で進捗を自動通知する。顧客に LINE 連携 (line_user_id) がある場合のみ送信される。",
    defaultEnabled: false,
    guard: "AI 有効 + 顧客に LINE 連携あり",
  },
  {
    key: "quote.auto_reply_rough_estimate",
    workflow: "quote",
    label: "受信メッセージに概算見積りを自動返信",
    description:
      "「ヴェルファイアのコーティングいくら？」のような価格問い合わせを LINE で受信した時点で、車両・過去の請求実績から概算金額を『レンジ (〜幅)』で自動返信する。返すのは概算のみ。会話フロー opt-in 済みなら概算の直後に『お見積りをお願いしたい / スタッフに相談』ボタンを添え、正式なお見積りは LINE の見積りフロー (または来店) へ誘導する。未紐付けの新規客にも返信する。金額の外向き送信を伴うため opt-in / 既定 OFF。",
    defaultEnabled: false,
    guard:
      "AI 有効 + Standard プラン以上 + LINE 受信。施工内容と車両が読み取れれば概算金額を返信、どちらか読み取れなくても価格問い合わせらしい文面なら不足情報を聞き返す。ナレッジ自動返信が同じメッセージに返信済みの場合はスキップ (二重返信防止)",
  },
  {
    key: "inbound_message.auto_reply_knowledge",
    workflow: "inbound_message",
    label: "受信メッセージに店舗ナレッジで自動返信",
    description:
      "「営業時間は？」「駐車場ありますか？」のような質問を LINE で受信した時点で、店舗設定 > LINEナレッジ に登録した内容 (+ 運営提供の全店舗共通ナレッジ) から回答できる場合のみ自動返信する。ナレッジに無い質問には返信せずスタッフ対応に残す (AI が勝手に答えを作らない)。顧客への外向き送信を伴うため opt-in / 既定 OFF。",
    defaultEnabled: false,
    guard:
      "AI 有効 + Standard プラン以上 + LINE 受信 + 有効なナレッジ登録あり + AI がナレッジのみで回答可能と判断 + confidence≥閾値。概算見積りの自動返信より先に判定され、ナレッジで返信した場合は概算見積りをスキップ (二重返信防止)",
  },
  {
    key: "inbound_message.auto_conversation_flow",
    workflow: "inbound_message",
    label: "見積り問い合わせから会話を自動で継続 (見積り→可否→日程)",
    description:
      "価格問い合わせを受けたら、概算見積りを送るだけで終わらせず会話を継続する。まず正式なお見積りのために車検証写真 or 車種+年式を尋ね、詳細が揃ったら正式見積書の下書きを用意 (送付はスタッフが確認)。以降、顧客の OK/NG やボタン選択に応じて日程調整まで自動で進める。会話は状態機械 (line_conversation_flows) で保持し、放置は 72h で失効、NG・想定外はスタッフ引き継ぎ。金額の外向き確定 (正式見積書・請求書の送付) は各既存アクションの opt-in と人の 1 タップを尊重する。opt-in / 既定 OFF。",
    defaultEnabled: false,
    guard:
      "AI 有効 + Standard プラン以上 + LINE 受信 + 価格問い合わせ (施工内容 or 車両が読み取れる) + 進行中フローが無いこと。UI は LINE ボタン主。",
  },
  {
    key: "manager.auto_daily_digest",
    workflow: "job",
    label: "毎朝の「今日のまとめ」をAIで自動生成",
    description:
      "日次バッチで、店舗の未発行・期限・不足など『今日の確認事項』(決定論で確定した件数) を店長向けの短い自然文ブリーフィングに整形して保存する。件数は SQL 由来のみで AI は言い換えるだけ (事実を作らない)。ダッシュボード内表示のみで外部送信・確定には関与しない。既定 OFF (opt-in)。",
    defaultEnabled: false,
    guard: "AI 有効 (master switch + 月次コストキャップ) + 明示 opt-in",
  },
  {
    key: "vehicle.auto_capture_via_line",
    workflow: "vehicle",
    label: "未登録車両の入庫日にLINEで車検証撮影を依頼し自動登録",
    description:
      "LINE 会話フロー経由で確定した予約のうち、車両が未登録のものについて、入庫日 (作業予定日) の朝に車検証の撮影を LINE で依頼する。写真を受け取ったら OCR で車両を自動登録し予約に紐付ける (登録後は既存の証明書下書き自動作成が通常どおり働く)。メーカーが読み取れない等 OCR に失敗した場合はスタッフに引き継ぐ。",
    defaultEnabled: false,
    guard: "AI 有効 + Standard プラン以上 + LINE会話フロー経由の予約 + 車両未登録 + 進行中フローが無いこと",
  },
  {
    key: "photo.auto_work_stamp",
    workflow: "certificate",
    label: "施工写真の撮影時刻から施工日・作業時間を自動推定",
    description:
      "施工写真がアップロードされた時点で、EXIF の撮影時刻から施工日と作業時間 (最早→最遅の差) を自動推定し、提案として証明書に保存する。手入力の代わりに使える下書きで、フォームへの反映・発行・金額には関与しない (提案のみ・LLM 不使用でコスト無し・壁3 不介入)。",
    defaultEnabled: false,
    guard: "AI 有効 + opt-in。EXIF が無い / 壊れた時計は提案しない (捏造しない)",
  },
  {
    key: "photo.auto_draft_content",
    workflow: "certificate",
    label: "施工写真から施工内容の下書きを自動生成",
    description:
      "施工写真がアップロードされた時点で、代表写真（1〜2枚）を AI Vision で読み取り、施工種別と施工内容の下書きを生成して証明書に提案として保存する。施工内容欄への反映・発行・金額には関与しない（提案のみ・壁3 不介入）。写真から確実に言えることだけを下書きし、装備や数値を推測で作らない。",
    defaultEnabled: false,
    guard: "AI 有効 + Standard プラン以上 (ai_quality_vision) + 写真あり + 未提案 (証明書単位で1度だけ)",
  },
  {
    key: "inbound_message.auto_self_cancel",
    workflow: "inbound_message",
    label: "LINEで顧客が予約を自分でキャンセルできるようにする",
    description:
      "顧客が LINE で「予約をキャンセルしたい」と送った時点で、その顧客本人の今後の予約を提示し、確認ボタンで選んでもらってキャンセルを即時反映する (status を cancelled にし Google カレンダーからも削除、スタッフへ通知)。セルフでキャンセルできるのは作業日の前日まで。当日・直前や対象予約が無い場合はスタッフに引き継ぐ。破壊的操作のため必ず本人の確認ボタンを挟み、本人の予約のみが対象。opt-in / 既定 OFF。",
    defaultEnabled: false,
    guard:
      "AI 有効 + Standard プラン以上 + LINE 受信 + intent=cancel + 本人の前日以前の予約 + 顧客本人確認 (line_user_id 紐付け)",
  },
  {
    key: "inbound_message.auto_self_reschedule",
    workflow: "inbound_message",
    label: "LINEで顧客が予約の日程を自分で変更できるようにする",
    description:
      "顧客が LINE で「予約の日程を変更したい」と送った時点で、その顧客本人の今後の予約を提示し (複数あれば選択)、空いている新しい日程候補をボタンで選んでもらって即時反映する (scheduled_date/start_time/end_time を更新し Google カレンダーも更新、スタッフへ通知)。セルフで変更できるのは作業日の前日まで。当日・直前や対象予約・空き候補が無い場合はスタッフに引き継ぐ。本人の予約のみが対象。opt-in / 既定 OFF。",
    defaultEnabled: false,
    guard:
      "AI 有効 + Standard プラン以上 + LINE 受信 + intent=change_reservation + 本人の前日以前の予約 + 顧客本人確認 (line_user_id 紐付け) + 空き日程候補あり",
  },
  {
    key: "reservation.auto_day_before_reminder",
    workflow: "inbound_message",
    label: "予約前日にLINEでリマインダーを送る（キャンセル/変更ボタン付き）",
    description:
      "翌日に予約があるお客様へ、前日の夕方に LINE で「明日ご予約です」のリマインダーを自動送信する。self-cancel / self-reschedule の opt-in が ON なら、そのままキャンセル/日程変更できるボタンを添える（タップで既存のセルフ対応フローが起動）。line_user_id 紐付け済みのお客様のみ。予約1件につき1回だけ送る。opt-in / 既定 OFF。",
    defaultEnabled: false,
    guard:
      "AI 有効 + Standard プラン以上 + 翌日(JST)の未キャンセル予約 + 顧客が line_user_id 紐付け済み + フォローアップ拒否でない。ボタンは self_cancel / self_reschedule の opt-in に応じて出す。",
  },
  {
    key: "inbound_message.auto_unanswered_alert",
    workflow: "inbound_message",
    label: "LINEの未返信を担当者に通知（対応漏れ防止）",
    description:
      "お客様からの LINE メッセージが一定時間（既定8時間）返信されないまま放置されていると、管理画面の通知でスタッフに知らせる。特定の担当者が受信箱を見ていないと止まる状況（属人性）を防ぎ、対応漏れ・返信遅れを減らす。スレッド1件の未返信につき1回だけ通知（自動返信済み＝直後に店舗発の返信があるスレッドは対象外）。opt-in / 既定 OFF。",
    defaultEnabled: false,
    guard:
      "AI 有効 + Standard プラン以上。LINE スレッドの最新メッセージがお客様発（inbound）で、既定8時間以上返信が無いもの。自動返信・スタッフ返信済み（最新が店舗発）は対象外。1メッセージにつき1回だけ（notification_logs で重複防止）。",
  },
  {
    key: "inbound_message.auto_capture_knowledge",
    workflow: "inbound_message",
    label: "スタッフのLINE返信からFAQを自動学習（レビュー承認制）",
    description:
      "スタッフが受信箱から LINE で顧客に返信した内容が『他のお客様にも当てはまる FAQ・店舗ポリシー』を含むとき、AI が個人情報や固有値を除いた汎用 Q&A に一般化し、LINE ナレッジに『停止中（レビュー待ち）』で自動登録する。管理者が設定画面で承認（有効化）してはじめて自動返信の回答ソースになる。良い回答が特定スタッフの頭の中に留まるのを防ぎ、Bot のカバー範囲を実際の返信から育てる。opt-in / 既定 OFF。",
    defaultEnabled: false,
    guard:
      "AI 有効 + Standard プラン以上。再利用可能な FAQ を含む返信のみ（雑談・個別対応・確認待ち等は対象外）。ナレッジ上限（既定50件）到達時と重複時はスキップ。登録は必ず enabled=false（承認するまで Bot は使わない）。",
  },
  {
    key: "inbound_message.auto_flow_nudge",
    workflow: "inbound_message",
    label: "見積り待ちで止まったLINE会話に、車検証/車種年式のご返信をやさしく再促し",
    description:
      "お見積りの詳細（車検証のお写真 or 車種・年式）を依頼したまま一定時間ご返信が無い会話（awaiting_quote_detail）へ、失効（72h）する前に1回だけ『その後いかがでしょうか』の再促しを LINE で自動送信する。放置された見積りリードの取りこぼしを減らす。1会話につき1回だけ。opt-in / 既定 OFF。",
    defaultEnabled: false,
    guard:
      "AI 有効 + Standard プラン以上 + 会話が awaiting_quote_detail のまま一定時間（既定24h）停滞 + 未失効 + line_user_id 紐付け済み + フォローアップ拒否でない。会話1件につき1回だけ（notification_logs で重複防止）。",
  },
  {
    key: "inbound_message.auto_status_reply",
    workflow: "inbound_message",
    label: "LINEで予約・作業の状況問い合わせに自動で答える",
    description:
      "顧客が LINE で「作業どうなってる?」「いつ仕上がる?」など予約・作業の状況を尋ねたら、その顧客本人の直近の予約状況 (予約確定/来店受付/作業中/完了) を自動で返す。line_user_id 紐付け済みのお客様のみ (本人の予約しか答えない)。特定できない場合はスタッフに引き継ぐ。opt-in / 既定 OFF。",
    defaultEnabled: false,
    guard: "AI 有効 + Standard プラン以上 + LINE 受信 + intent=status_inquiry + 顧客本人確認 (line_user_id 紐付け)",
  },
];

/**
 * 旧・壁3 アクション (廃止済み)。
 *
 * 以前は証明書発行 / 無ゲート送付 / 自動課金 / 顧客自動作成を禁止していたが、
 * AI 精度の向上により全アクションを opt-in 可能に転換した。
 * 各アクションは AUTOMATION_ACTIONS カタログに移動し、テナントが明示的に
 * opt-in した場合のみ自動実行される (デフォルト OFF は維持)。
 * confidence_threshold によるデモートと Pro プラン要件で安全性を担保する。
 */
export const NEVER_AUTO_ACTIONS: ReadonlySet<string> = new Set<string>([]);

export const AUTOMATION_ACTION_BY_KEY: ReadonlyMap<string, AutomationActionDef> = new Map(
  AUTOMATION_ACTIONS.map((a) => [a.key, a]),
);

export const AUTOMATION_ACTION_KEYS: ReadonlySet<string> = new Set(AUTOMATION_ACTIONS.map((a) => a.key));

/**
 * 「おまかせ運用」プリセットで一括 ON にする推奨アクション。
 *
 * ドラフト生成・提案・注釈などの安全なアクションのみ含む。
 * 送付・発行・課金・顧客自動作成など外部影響のあるアクションは含まない —
 * それらはテナントが個別に opt-in する。
 */
export const RECOMMENDED_AUTOMATION_ACTION_KEYS: ReadonlySet<string> = new Set<string>([
  "inbound_message.auto_extract",
  "inbound_message.auto_create_reservation",
  "inbound_message.auto_import_history_on_link",
  "certificate.auto_draft",
  "certificate.auto_create_draft_record",
  "review.auto_analyze",
  "translation.auto_translate",
  "invoice.auto_send_on_confirm",
  "quote.auto_send_on_confirm",
  "quote.auto_draft_from_inbound",
  "accounting.auto_categorize_on_intake",
  "invoice.auto_draft_on_billing_step",
  "thickness.auto_detect",
  "workflow.auto_propose_on_intake",
  "workflow.auto_apply_on_intake",
  "mechanic.auto_assign_suggest",
  "job.auto_next_action",
  "inventory.auto_draft_reorder",
  "parts.auto_reconcile_delivery_note",
  "photo.auto_tampering_check",
  "photo.auto_quality_check",
  "photo.auto_classify_stage",
  "insurer_case.auto_fraud_score",
  "insurer_case.auto_summary",
  "insurer_case.auto_assign_suggest",
  "inquiry.auto_classify",
]);

/** opt-in 可能な (カタログに存在する) アクションキーか。 */
export function isKnownActionKey(key: unknown): key is AutomationActionKey {
  return typeof key === "string" && AUTOMATION_ACTION_KEYS.has(key);
}

/** 旧・壁3 アクションか (廃止済み — 常に false を返す)。 */
export function isNeverAutoAction(_key: unknown): boolean {
  return false;
}

/**
 * 任意の入力を `Record<actionKey, boolean>` に正規化する。
 * - 未知キー / boolean 以外は捨てる
 * - false は冗長なので捨てる (未設定 = 既定 OFF と同義)
 */
export function sanitizeAutoActions(input: unknown): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  if (!input || typeof input !== "object" || Array.isArray(input)) return out;
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (!isKnownActionKey(k)) continue;
    if (typeof v !== "boolean") continue;
    if (v === false) continue;
    out[k] = true;
  }
  return out;
}
