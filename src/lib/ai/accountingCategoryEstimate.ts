/**
 * freee / マネーフォワード 連携の「勘定科目」自動推定。
 *
 * 既存の `/admin/accounting` はデフォルト売上勘定を 1 つしか設定できないが、
 * 実態は明細ごとに違う科目を当てたい (例: 施工料 → 役務収益、材料 → 売上原価、
 * 値引 → 雑収入)。ここでは請求書明細を受け取り、freee の勘定マスタ
 * (account_code) と対応付ける。
 *
 * Deterministic ルール (キーワードマッチ) を先に評価し、不明分だけ Haiku に
 * 投げる二段構え。マッチしたものは confidence=1.0 で固定。
 */
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { withRetry } from "@/lib/http/withRetry";
import { getAnthropicClient, AI_MODEL_FAST } from "@/lib/ai/client";

export interface AccountingLineInput {
  description: string;
  amount: number;
  is_reduced_rate?: boolean;
}

export interface AccountingAccount {
  /** freee 勘定科目コード (例: "411" = 売上高) */
  code: string;
  label: string;
  /** マッチに使うキーワード (部分一致、小文字比較) */
  keywords?: string[];
}

export interface AccountingCategorizeResult {
  lines: Array<{
    description: string;
    amount: number;
    suggested_code: string;
    suggested_label: string;
    confidence: number;
    method: "rule" | "ai" | "fallback";
  }>;
}

const AiSchema = z.object({
  classifications: z.array(
    z.object({
      index: z.number().int().min(0),
      code: z.string(),
      confidence: z.number().min(0).max(1),
    }),
  ),
});

/**
 * 明細ごとに最適な勘定科目を 1 つ提案する。
 *
 * - accounts: freee / マネーフォワード から取得した勘定マスタ
 * - fallbackCode: マッチも AI 推定も失敗したときの最後の砦 (通常は "売上高")
 */
export async function categorizeAccountingLines(
  lines: AccountingLineInput[],
  accounts: AccountingAccount[],
  fallbackCode: string,
  opts?: { model?: string },
): Promise<AccountingCategorizeResult> {
  const accountByCode = new Map(accounts.map((a) => [a.code, a]));
  const fallback = accountByCode.get(fallbackCode);

  const result: AccountingCategorizeResult["lines"] = lines.map((line) => {
    const ruleHit = matchByKeyword(line.description, accounts);
    if (ruleHit) {
      return {
        description: line.description,
        amount: line.amount,
        suggested_code: ruleHit.code,
        suggested_label: ruleHit.label,
        confidence: 1.0,
        method: "rule" as const,
      };
    }
    return {
      description: line.description,
      amount: line.amount,
      suggested_code: fallback?.code ?? fallbackCode,
      suggested_label: fallback?.label ?? "未分類",
      confidence: 0,
      method: "fallback" as const,
    };
  });

  // AI を呼ぶ必要のある index を集める
  const unresolved = result.map((r, i) => ({ r, i })).filter((x) => x.r.method === "fallback");

  if (unresolved.length === 0 || !process.env.ANTHROPIC_API_KEY) {
    return { lines: result };
  }

  const client = getAnthropicClient();
  const codeList = accounts.map((a) => `- ${a.code}: ${a.label}`).join("\n");
  const lineList = unresolved
    .map((u) => `index=${u.i} | ¥${u.r.amount.toLocaleString("ja-JP")} | ${u.r.description}`)
    .join("\n");

  try {
    const msg = await withRetry("anthropic", () =>
      client.messages.parse({
        model: opts?.model ?? AI_MODEL_FAST,
        max_tokens: 768,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: `次の明細を勘定科目に分類してください。\n\n【勘定マスタ】\n${codeList}\n\n【明細】\n${lineList}`,
          },
        ],
        output_config: { format: zodOutputFormat(AiSchema) },
      }),
    );
    const parsed = msg.parsed_output;
    if (!parsed) return { lines: result };
    for (const c of parsed.classifications) {
      const target = result[c.index];
      if (!target) continue;
      const account = accountByCode.get(c.code);
      if (!account) continue;
      target.suggested_code = account.code;
      target.suggested_label = account.label;
      target.confidence = c.confidence;
      target.method = "ai";
    }
  } catch (err) {
    console.error("[accountingCategoryEstimate] generation failed:", err);
  }

  return { lines: result };
}

const SYSTEM_PROMPT = `あなたは自動車施工店の経理を支援するアシスタントです。
請求書の明細を、与えられた勘定マスタから 1 件選んで分類してください。

ルール:
- 与えた勘定コード以外を返さない (新規コード捏造禁止)
- 不明確な明細は最も近い "売上高" 系を選び、confidence を下げる
- confidence は 0.0〜1.0 (1.0 = 確実)
- 同一 index に対して 1 件のみ返す`.trim();

function matchByKeyword(description: string, accounts: AccountingAccount[]): AccountingAccount | null {
  const desc = description.toLowerCase();
  for (const a of accounts) {
    if (!a.keywords?.length) continue;
    for (const k of a.keywords) {
      if (k && desc.includes(k.toLowerCase())) return a;
    }
  }
  return null;
}
