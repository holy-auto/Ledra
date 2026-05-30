/**
 * 自動化レベルの「自己学習」層 (純関数のみ)。
 *
 * ai_usage_logs の実績 (確信度の分布・件数・outcome) を集計し、
 * 「このワークフローは auto-action を有効化してよさそう / まだ早い」を推薦する。
 * これにより、テナントは勘ではなく実データに基づいて自動化レベルを上げ下げできる
 * (= "入力ゼロ" の天井を安全に押し上げる)。
 *
 * 重要: 壁3 (証明書発行 / 課金 / 本人確認) は決して "auto 化推奨" に含めない。
 * 対象は actionCatalog の opt-in 可能アクションに対応するエンドポイントのみ。
 *
 * DB アクセスはしない (呼び出し側が ai_usage_logs を渡す)。
 */

import type { AutomationActionKey } from "./actionCatalog";
import type { AutomationWorkflowKey } from "./fieldCatalog";
import type { AiAutomationSettings } from "./policy";

export interface UsageRowLike {
  endpoint: string | null;
  outcome: string | null;
  confidence: number | null;
}

/** 推薦を出すのに最低限必要な ok サンプル数。 */
export const MIN_SAMPLES = 20;
/** auto 化を推奨する平均確信度の下限。 */
export const PROMOTE_CONFIDENCE = 0.8;

interface EndpointMeta {
  workflow: AutomationWorkflowKey;
  actionKey: AutomationActionKey;
  label: string;
}

/**
 * AI エンドポイント → (workflow, opt-in 可能な auto-action) の対応。
 * ここに無いエンドポイント (壁3 や集計対象外) は推薦に出さない。
 */
const ENDPOINT_META: Readonly<Record<string, EndpointMeta>> = {
  "/api/admin/customer-messages/[id]/ai-extract": {
    workflow: "inbound_message",
    actionKey: "inbound_message.auto_extract",
    label: "受信メッセージの自動AI抽出",
  },
  "/api/admin/reservations/ai-from-message": {
    workflow: "inbound_message",
    actionKey: "inbound_message.auto_extract",
    label: "受信メッセージの自動AI抽出",
  },
  "/api/line/webhook#auto-extract": {
    workflow: "inbound_message",
    actionKey: "inbound_message.auto_create_reservation",
    label: "受信メッセージからの予約自動起票",
  },
  "/api/admin/certificates/ai-draft": {
    workflow: "certificate",
    actionKey: "certificate.auto_draft",
    label: "証明書ドラフトの自動生成",
  },
  "/api/admin/reviews/ai-sentiment": {
    workflow: "review",
    actionKey: "review.auto_analyze",
    label: "レビュー感情分析の自動実行",
  },
  "/api/admin/translate": {
    workflow: "translation",
    actionKey: "translation.auto_translate",
    label: "お知らせの自動翻訳",
  },
};

export type RecommendationKind =
  | "enable_auto" // 実績十分・高確信 → opt-in 推奨
  | "already_auto" // 既に opt-in 済み
  | "keep" // 様子見 (確信は閾値以上だが auto には届かない)
  | "needs_attention" // 確信が閾値未満 — auto 化しない方がよい
  | "insufficient_data"; // サンプル不足

export interface ActionRecommendation {
  actionKey: AutomationActionKey;
  workflow: AutomationWorkflowKey;
  label: string;
  samples: number;
  avgConfidence: number | null;
  /** ok 以外 (error 等) を含む総コール数。 */
  totalCalls: number;
  kind: RecommendationKind;
  message: string;
  /** kind === "enable_auto" のとき true。UI が CTA を出すのに使う。 */
  recommendEnable: boolean;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * ai_usage_logs の行から、auto-action ごとの自動化レベル推薦を生成する。
 *
 * @param rows ai_usage_logs (期間で絞った行)
 * @param settings 現在のテナント設定 (既に有効な action / confidence 閾値の参照)
 */
export function recommendAutoActions(rows: UsageRowLike[], settings: AiAutomationSettings): ActionRecommendation[] {
  // actionKey ごとに集計 (複数エンドポイントが同じ action に対応しうる)。
  const agg = new Map<AutomationActionKey, { meta: EndpointMeta; total: number; confSum: number; confN: number }>();

  for (const r of rows) {
    if (!r.endpoint) continue;
    const meta = ENDPOINT_META[r.endpoint];
    if (!meta) continue;
    const cur = agg.get(meta.actionKey) ?? { meta, total: 0, confSum: 0, confN: 0 };
    cur.total += 1;
    if (r.outcome === "ok" && typeof r.confidence === "number") {
      cur.confSum += r.confidence;
      cur.confN += 1;
    }
    agg.set(meta.actionKey, cur);
  }

  const threshold = settings.confidenceThreshold;
  const out: ActionRecommendation[] = [];

  for (const [actionKey, v] of agg.entries()) {
    const samples = v.confN;
    const avg = samples > 0 ? round2(v.confSum / samples) : null;
    const alreadyEnabled = settings.autoActions?.[actionKey] === true;

    let kind: RecommendationKind;
    let message: string;

    if (alreadyEnabled) {
      kind = "already_auto";
      message = "既に自動化が有効です。";
    } else if (samples < MIN_SAMPLES) {
      kind = "insufficient_data";
      message = `サンプルが不足しています (${samples}/${MIN_SAMPLES} 件)。もう少し実績が貯まると判定できます。`;
    } else if (avg !== null && avg >= PROMOTE_CONFIDENCE) {
      kind = "enable_auto";
      message = `直近 ${samples} 件の平均確信度が ${avg} と高水準です。自動化 (opt-in) を推奨します。`;
    } else if (avg !== null && avg < threshold) {
      kind = "needs_attention";
      message = `平均確信度 ${avg} が閾値 ${threshold} を下回っています。自動化は控え、提案 (要確認) のままを推奨します。`;
    } else {
      kind = "keep";
      message = `平均確信度 ${avg ?? "—"}。自動化の閾値 (${PROMOTE_CONFIDENCE}) には届いていません。様子見を推奨します。`;
    }

    out.push({
      actionKey,
      workflow: v.meta.workflow,
      label: v.meta.label,
      samples,
      avgConfidence: avg,
      totalCalls: v.total,
      kind,
      message,
      recommendEnable: kind === "enable_auto",
    });
  }

  // enable_auto を上位に、その後 totalCalls 降順。
  const rank: Record<RecommendationKind, number> = {
    enable_auto: 0,
    needs_attention: 1,
    keep: 2,
    insufficient_data: 3,
    already_auto: 4,
  };
  out.sort((a, b) => rank[a.kind] - rank[b.kind] || b.totalCalls - a.totalCalls);
  return out;
}
