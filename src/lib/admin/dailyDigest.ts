/**
 * 店長向け「今日のまとめ」(AIマネージャー) の生成。
 *
 * deriveTodayTasks が決定論で確定したタイル (label + count) を入力に、店長が
 * 朝礼で読む短いブリーフィング文を作る。数値・項目はすべてタイル由来で、AI は
 * それを言い換えるだけ — AI が事実を作らないための土台 (CLAUDE.md「AI は事実を
 * 作ってはいけない」)。AI が使えない/失敗時は決定論フォールバックを返す。
 *
 * buildDeterministicDigest はダッシュボード描画時に AI コストなしで即返す用途、
 * generateDailyDigest は日次 cron (opt-in・コストキャップ下) で AI 整形する用途。
 */
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { withRetry } from "@/lib/http/withRetry";
import { getAnthropicClient, AI_MODEL_FAST } from "@/lib/ai/client";
import type { TaskTile } from "@/lib/admin/todayTasks";

export interface DailyDigestResult {
  /** 店長に見せる本文 (2〜4文)。 */
  text: string;
  /** AI 生成なら true、決定論フォールバックなら false。 */
  ai: boolean;
}

const EMPTY_TEXT = "本日の急ぎタスクはありません。クイックアクションから次の作業に進んでください。";

/**
 * タイルを日本語 1 文にまとめる決定論フォールバック。件数はタイル由来のみで、
 * 創作しない。AI 不要・即時・無料。
 */
export function buildDeterministicDigest(tiles: TaskTile[]): DailyDigestResult {
  if (tiles.length === 0) return { text: EMPTY_TEXT, ai: false };
  const parts = tiles.map((t) => `${t.label} ${t.count}件`);
  return { text: `本日の確認事項: ${parts.join("、")}。`, ai: false };
}

const DigestSchema = z.object({ summary: z.string().max(400) });

const SYSTEM_PROMPT = `あなたは自動車施工店の店長を補佐するアシスタントです。
店舗の「本日の確認事項」を、店長が朝礼で読む短いブリーフィングにまとめてください。

最重要ルール (逸脱禁止):
- 入力の <確認事項> にある項目と件数だけを根拠にする。件数・項目を創作してはならない。
- 入力に無い数値・事実・推測を書いてはならない。
- 精神論 (「頑張りましょう」等) は不要。何を確認・対応すべきかだけを簡潔に。

文体:
- 丁寧で簡潔な日本語。2〜4 文、目安 150 字以内。
- 緊急度の高いもの (urgent) から先に触れる。`.trim();

/**
 * タイルを AI で自然文のブリーフィングに整形する。数値・項目はタイル由来のみを
 * 使うよう system prompt で制約し、失敗時は決定論フォールバックへ落ちる。
 * 描画のたびに呼ぶとコストがかかるため、日次 cron からの利用を想定。
 */
export async function generateDailyDigest(
  tiles: TaskTile[],
  opts?: { tenantName?: string | null; model?: string },
): Promise<DailyDigestResult> {
  const fallback = buildDeterministicDigest(tiles);
  if (!process.env.ANTHROPIC_API_KEY || tiles.length === 0) return fallback;

  const client = getAnthropicClient();
  const facts = tiles.map((t) => `- [${t.tone}] ${t.label}: ${t.count}件 (${t.hint})`).join("\n");
  const meta = opts?.tenantName?.trim() ? `店舗名: ${opts.tenantName.trim()}\n\n` : "";

  try {
    const msg = await withRetry("anthropic", () =>
      client.messages.parse({
        model: opts?.model ?? AI_MODEL_FAST,
        max_tokens: 400,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: `${meta}<確認事項>\n${facts}\n</確認事項>` }],
        output_config: { format: zodOutputFormat(DigestSchema) },
      }),
    );
    const parsed = msg.parsed_output;
    if (!parsed?.summary?.trim()) return fallback;
    return { text: parsed.summary.trim(), ai: true };
  } catch (err) {
    console.error("[dailyDigest] failed:", err);
    return fallback;
  }
}
