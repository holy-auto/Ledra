/**
 * BtoB 自動マッチング — SQL 候補抽出 + スコアリング (純関数) + LLM 推薦文。
 *
 * 設計:
 * - SQL (Supabase) で候補テナントを最大 50 件取得するのは呼び出し側の責務。
 * - この関数は候補リストをスコアリングして上位を返す (純関数 → テスト容易)。
 * - LLM はスコア上位 3 件に対して推薦文を生成するだけ。マッチング判断は純粋に
 *   ルールベースで行う。
 *
 * スコア要素:
 * - category_match    : 要求カテゴリのうち何件がマッチするか (0〜40 点)
 * - contract_active   : 既存の有効契約あり → +20 点 (実績のある施工店を優遇)
 * - case_volume       : 直近 90 日の案件数が 0 → ペナルティ -10 点 (休眠施工店)
 * - region_match      : 都道府県が一致 → +20 点
 * - rating            : 平均レーティング (0〜5) → × 4 で最大 20 点
 */

import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { withRetry } from "@/lib/http/withRetry";
import { getAnthropicClient, AI_MODEL_FAST } from "@/lib/ai/client";

const BtobRecommendationSchema = z.object({
  text: z.string(),
});

// ─────────────────────────────────────────────
// 型
// ─────────────────────────────────────────────

export interface TenantCandidate {
  tenantId: string;
  name: string;
  /** 施工店が対応するサービスカテゴリ一覧 (例: ["ppf", "coating"]) */
  serviceCategories: string[];
  /** 都道府県 (例: "東京都") */
  prefecture: string | null;
  /** 直近 90 日の案件数 */
  recentCaseCount: number;
  /** 既存の有効契約があるか */
  hasActiveContract: boolean;
  /** 平均レーティング (0〜5)。不明なら null */
  avgRating: number | null;
}

export interface MatchRequirements {
  /** 保険会社が要求するサービスカテゴリ (例: ["ppf"]) */
  categories: string[];
  /** 都道府県フィルター (null なら不問) */
  prefecture: string | null;
}

export interface MatchResult {
  tenantId: string;
  name: string;
  score: number;
  /** スコア要素の内訳 */
  breakdown: {
    categoryMatch: number;
    contractActive: number;
    caseVolume: number;
    regionMatch: number;
    rating: number;
  };
  /** LLM が生成した推薦文 (上位 3 件のみ) */
  recommendationText: string | null;
}

// ─────────────────────────────────────────────
// スコアリング (純関数)
// ─────────────────────────────────────────────

export function scoreTenant(
  candidate: TenantCandidate,
  req: MatchRequirements,
): MatchResult["breakdown"] & { total: number } {
  // カテゴリマッチ (要求カテゴリのうち施工店が対応する割合 × 40)
  const categoryMatch =
    req.categories.length === 0
      ? 40
      : Math.round(
          (req.categories.filter((c) => candidate.serviceCategories.includes(c)).length / req.categories.length) * 40,
        );

  // 既存契約ボーナス
  const contractActive = candidate.hasActiveContract ? 20 : 0;

  // 案件数ペナルティ (直近 90 日が 0 件は休眠施工店)
  const caseVolume = candidate.recentCaseCount === 0 ? -10 : 0;

  // 都道府県一致ボーナス
  const regionMatch =
    req.prefecture == null || req.prefecture === ""
      ? 10 // 不問の場合は中立
      : candidate.prefecture === req.prefecture
        ? 20
        : 0;

  // レーティング (最大 20 点)
  const rating = candidate.avgRating != null ? Math.round(candidate.avgRating * 4) : 10;

  const total = Math.max(0, categoryMatch + contractActive + caseVolume + regionMatch + rating);
  return { categoryMatch, contractActive, caseVolume, regionMatch, rating, total };
}

export function rankCandidates(candidates: TenantCandidate[], req: MatchRequirements, limit = 10): MatchResult[] {
  return candidates
    .map((c) => {
      const { total, ...breakdown } = scoreTenant(c, req);
      return {
        tenantId: c.tenantId,
        name: c.name,
        score: total,
        breakdown,
        recommendationText: null,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

// ─────────────────────────────────────────────
// LLM 推薦文生成 (上位 N 件のみ)
// ─────────────────────────────────────────────

async function generateRecommendationText(
  match: MatchResult,
  req: MatchRequirements,
  opts?: { model?: string },
): Promise<string> {
  try {
    const client = getAnthropicClient();
    const msg = await withRetry("anthropic", () =>
      client.messages.parse({
        model: opts?.model ?? AI_MODEL_FAST,
        max_tokens: 128,
        system: `あなたは自動車施工業界の BtoB マッチング担当者です。
以下の施工店を保険会社に推薦する文章を1〜2文（80文字以内）で生成してください。
会社名は「${match.name}」、スコアは ${match.score} 点です。
要求カテゴリ: ${req.categories.join(", ") || "指定なし"}
エリア: ${req.prefecture ?? "指定なし"}
JSONで回答してください: {"text": "推薦文"}`,
        messages: [{ role: "user", content: "推薦文を生成してください。" }],
        output_config: { format: zodOutputFormat(BtobRecommendationSchema) },
      }),
    );
    return msg.parsed_output?.text ?? "";
  } catch {
    return "";
  }
}

// ─────────────────────────────────────────────
// メインエントリポイント
// ─────────────────────────────────────────────

/**
 * 候補テナントをスコアリングして上位を返し、上位 3 件に推薦文を付与する。
 *
 * @param candidates DB から取得済みのテナント候補
 * @param requirements 保険会社の要求条件
 * @param topN 推薦文を付与する上位件数 (default: 3)
 */
export async function matchBtobTenants(
  candidates: TenantCandidate[],
  requirements: MatchRequirements,
  topN = 3,
  opts?: { model?: string },
): Promise<MatchResult[]> {
  const ranked = rankCandidates(candidates, requirements);

  if (ranked.length === 0) return [];

  // 上位 N 件だけ LLM 推薦文を生成 (並列)
  const withText = await Promise.all(
    ranked.map(async (r, idx) => {
      if (idx >= topN) return r;
      const text = await generateRecommendationText(r, requirements, opts);
      return { ...r, recommendationText: text || null };
    }),
  );

  return withText;
}
