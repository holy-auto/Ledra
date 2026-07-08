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
  | "accounting.auto_categorize_on_intake"
  | "invoice.auto_draft_on_billing_step"
  | "invoice.auto_draft_on_completion"
  | "thickness.auto_detect"
  | "workflow.auto_propose_on_intake"
  | "workflow.auto_apply_on_intake"
  | "job.auto_next_action"
  | "inventory.auto_draft_reorder"
  | "parts.auto_reconcile_delivery_note"
  | "photo.auto_tampering_check"
  | "photo.auto_quality_check"
  | "insurer_case.auto_fraud_score"
  | "insurer_case.auto_summary"
  | "insurer_case.auto_assign_suggest"
  | "inquiry.auto_classify"
  | "customer.auto_create"
  | "payment.auto_charge"
  | "body_repair.auto_notify_on_stage_advance";

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
  "job.auto_next_action",
  "inventory.auto_draft_reorder",
  "parts.auto_reconcile_delivery_note",
  "photo.auto_tampering_check",
  "photo.auto_quality_check",
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
