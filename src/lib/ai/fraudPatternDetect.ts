/**
 * 不正パターン検出 — ルールベース一次フィルター + LLM グレーゾーン判定。
 *
 * 対象: 代理店 / BtoB / 保険請求の不正リスク評価。
 *
 * 設計:
 * - 純関数 `detectFraudRuleFlags` でルールベースの一次フィルターを実行。
 *   これだけで "明確にクリア" か "明確にアウト" を判定できる場合は LLM を呼ばない。
 * - グレーゾーン (low/medium フラグあり) のみ LLM を呼んで根拠付き判定を行う。
 * - fail-open: LLM エラーは "inconclusive" として業務をブロックしない。
 *
 * ルール一覧:
 * - duplicate_claim     : 同テナント × 同証明書で同期間に複数の保険案件
 * - velocity_spike      : 短期間 (7 日) の案件数が閾値を超えている
 * - round_amount        : 請求金額がキリのいい数値 (端数 0) → 見積もり慣行が疑われる
 * - same_day_multi      : 同日に同顧客 / 同車両で複数件
 * - certificate_void    : 証明書がすでに void なのに保険請求がある
 * - high_claim_amount   : 単一案件で閾値以上の高額請求 (default: 500,000 円)
 */

import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { withRetry } from "@/lib/http/withRetry";
import { getAnthropicClient, AI_MODEL_FAST } from "@/lib/ai/client";

const FraudLlmSchema = z.object({
  riskLevel: z.enum(["high", "medium", "low", "clear"]),
  reason: z.string(),
});

// ─────────────────────────────────────────────
// 型
// ─────────────────────────────────────────────

export type FraudFlag =
  | "duplicate_claim"
  | "velocity_spike"
  | "round_amount"
  | "same_day_multi"
  | "certificate_void"
  | "high_claim_amount";

export type FraudRisk = "high" | "medium" | "low" | "clear";

export interface FraudRuleInput {
  /** 今回評価する案件の金額 (円) */
  claimAmount: number | null;
  /** 評価対象の証明書ステータス */
  certificateStatus: string | null;
  /** 同じ insurer × certificate_id の既存案件数 (今回の案件を含まない) */
  existingClaimsForCertificate: number;
  /** 過去 7 日間の同 insurer の案件数 (今回を含む) */
  claimsLast7Days: number;
  /** 同日 × 同テナント × 同車両の案件数 (今回を含む) */
  sameDaySameVehicle: number;
  /** 高額閾値 (円)。default 500,000 */
  highAmountThreshold?: number;
  /** 速度スパイク閾値 (7日間案件数)。default 10 */
  velocityThreshold?: number;
}

export interface FraudCheckResult {
  flags: FraudFlag[];
  riskLevel: FraudRisk;
  /** LLM が生成した根拠文 (LLM 呼び出し時のみ) */
  llmReason: string | null;
  /** LLM を呼んだかどうか */
  usedLlm: boolean;
}

// ─────────────────────────────────────────────
// ルールベース一次フィルター (純関数)
// ─────────────────────────────────────────────

export function detectFraudRuleFlags(input: FraudRuleInput): FraudFlag[] {
  const flags: FraudFlag[] = [];
  const highThreshold = input.highAmountThreshold ?? 500_000;
  const velocityThreshold = input.velocityThreshold ?? 10;

  // 同証明書に既存案件あり → 重複請求の疑い
  if (input.existingClaimsForCertificate > 0) {
    flags.push("duplicate_claim");
  }

  // 7 日間に閾値超えの案件数 → velocity spike
  if (input.claimsLast7Days >= velocityThreshold) {
    flags.push("velocity_spike");
  }

  // 請求金額がキリのいい数値 (10000 単位)
  if (input.claimAmount != null && input.claimAmount >= 10_000 && input.claimAmount % 10_000 === 0) {
    flags.push("round_amount");
  }

  // 同日・同車両・複数件
  if (input.sameDaySameVehicle > 1) {
    flags.push("same_day_multi");
  }

  // 証明書が void
  if (input.certificateStatus === "void") {
    flags.push("certificate_void");
  }

  // 高額請求
  if (input.claimAmount != null && input.claimAmount >= highThreshold) {
    flags.push("high_claim_amount");
  }

  return flags;
}

// ─────────────────────────────────────────────
// リスクレベル判定 (純関数)
// ─────────────────────────────────────────────

const HIGH_RISK_FLAGS: FraudFlag[] = ["duplicate_claim", "certificate_void", "same_day_multi"];
const MEDIUM_RISK_FLAGS: FraudFlag[] = ["velocity_spike", "high_claim_amount"];

export function deriveRiskLevel(flags: FraudFlag[]): FraudRisk {
  if (flags.length === 0) return "clear";
  if (flags.some((f) => HIGH_RISK_FLAGS.includes(f))) return "high";
  if (flags.some((f) => MEDIUM_RISK_FLAGS.includes(f))) return "medium";
  return "low"; // round_amount のみなど
}

// ─────────────────────────────────────────────
// LLM グレーゾーン判定 (low / medium のみ呼ぶ)
// ─────────────────────────────────────────────

async function llmFraudEvaluation(
  input: FraudRuleInput,
  flags: FraudFlag[],
): Promise<{ riskLevel: FraudRisk; reason: string }> {
  try {
    const client = getAnthropicClient();
    const flagList = flags.map((f) => `・${f}`).join("\n");

    const msg = await withRetry("anthropic", () =>
      client.messages.parse({
        model: AI_MODEL_FAST,
        max_tokens: 256,
        system: `あなたは自動車施工業界の保険請求不正検出の専門家です。
以下のルールベースフラグが検出されました:
${flagList}

案件情報:
- 請求金額: ${input.claimAmount != null ? `¥${input.claimAmount.toLocaleString("ja-JP")}` : "不明"}
- 同証明書の既存案件数: ${input.existingClaimsForCertificate}
- 過去7日間の案件数: ${input.claimsLast7Days}
- 同日同車両の案件数: ${input.sameDaySameVehicle}
- 証明書ステータス: ${input.certificateStatus ?? "不明"}

これらのフラグを踏まえて、総合的な不正リスクを評価してください。
JSONで回答してください:
{"riskLevel": "high|medium|low|clear", "reason": "根拠を1文で（50文字以内）"}`,
        messages: [{ role: "user", content: "この案件の不正リスクを評価してください。" }],
        output_config: { format: zodOutputFormat(FraudLlmSchema) },
      }),
    );

    const parsed = msg.parsed_output;
    return { riskLevel: parsed?.riskLevel ?? deriveRiskLevel(flags), reason: parsed?.reason ?? "" };
  } catch {
    // LLM 失敗 → ルールベース判定を維持
    return { riskLevel: deriveRiskLevel(flags), reason: "" };
  }
}

// ─────────────────────────────────────────────
// メインエントリポイント
// ─────────────────────────────────────────────

/**
 * 不正パターンチェック。
 *
 * - flags が 0 件 → "clear" (LLM 呼ばず)
 * - flags に high-risk フラグ → "high" (LLM 呼ばず、ルールベースで確定)
 * - flags に low/medium のみ → LLM でグレーゾーン判定
 */
export async function checkFraudPatterns(input: FraudRuleInput): Promise<FraudCheckResult> {
  const flags = detectFraudRuleFlags(input);
  const ruleRisk = deriveRiskLevel(flags);

  // クリアまたは高リスク確定 → LLM 不要
  if (ruleRisk === "clear" || ruleRisk === "high") {
    return { flags, riskLevel: ruleRisk, llmReason: null, usedLlm: false };
  }

  // グレーゾーン → LLM で判定
  const llm = await llmFraudEvaluation(input, flags);
  return {
    flags,
    riskLevel: llm.riskLevel,
    llmReason: llm.reason || null,
    usedLlm: true,
  };
}
