/**
 * 店舗お知らせ / 製品説明 / 利用規約 などのテキストを多言語化する。
 *
 * 対応言語: en (英) / zh (中) / vi (ベトナム) / ko (韓) / pt-BR (ポルトガル)
 * - ソース言語は自動判定 (ja を想定)
 * - 同じテキストの繰り返し翻訳防止のためハッシュ計算を提供 (cache key)
 *
 * 失敗時は元テキストをそのまま返し、ai=false にする (フェイルオープン)。
 */
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { withRetry } from "@/lib/http/withRetry";
import { getAnthropicClient, AI_MODEL_FAST } from "@/lib/ai/client";

export type TargetLang = "en" | "zh" | "vi" | "ko" | "pt-BR";

export const SUPPORTED_LANGUAGES: ReadonlyArray<{ key: TargetLang; label: string }> = [
  { key: "en", label: "English" },
  { key: "zh", label: "中文 (簡体)" },
  { key: "vi", label: "Tiếng Việt" },
  { key: "ko", label: "한국어" },
  { key: "pt-BR", label: "Português (BR)" },
];

export interface TranslateInput {
  text: string;
  targetLang: TargetLang;
  /** 翻訳のトーン (formal / casual / marketing)。デフォルト formal。 */
  tone?: "formal" | "casual" | "marketing";
  /** 用語集 (key=原文 → value=訳語)。製品名・ブランド名を統一する。 */
  glossary?: Record<string, string>;
}

const ResultSchema = z.object({
  translated: z.string().min(1),
  confidence: z.number().min(0).max(1),
});

export interface TranslateResult {
  translated: string;
  confidence: number;
  ai: boolean;
}

export async function translateText(input: TranslateInput): Promise<TranslateResult> {
  if (!input.text.trim()) return { translated: "", confidence: 0, ai: false };
  if (!process.env.ANTHROPIC_API_KEY) return { translated: input.text, confidence: 0, ai: false };

  const client = getAnthropicClient();
  const langLabel = SUPPORTED_LANGUAGES.find((l) => l.key === input.targetLang)?.label ?? input.targetLang;
  const tone = input.tone ?? "formal";
  const glossaryText = input.glossary
    ? Object.entries(input.glossary)
        .map(([src, dst]) => `- "${src}" → "${dst}"`)
        .join("\n")
    : "(用語集なし)";

  try {
    const msg = await withRetry("anthropic", () =>
      client.messages.parse({
        model: AI_MODEL_FAST,
        max_tokens: 2048,
        system: buildSystemPrompt(langLabel, tone),
        messages: [
          {
            role: "user",
            content: `用語集 (必ず以下のとおりに置換):\n${glossaryText}\n\n本文:\n${input.text.slice(0, 8000)}`,
          },
        ],
        output_config: { format: zodOutputFormat(ResultSchema) },
      }),
    );
    const parsed = msg.parsed_output;
    if (!parsed) return { translated: input.text, confidence: 0, ai: false };
    return { translated: parsed.translated, confidence: parsed.confidence, ai: true };
  } catch (err) {
    console.error("[translateContent] failed:", err);
    return { translated: input.text, confidence: 0, ai: false };
  }
}

function buildSystemPrompt(langLabel: string, tone: "formal" | "casual" | "marketing"): string {
  const toneGuide = {
    formal: "敬体・丁寧語を保つ。ビジネス文書として読める品質。",
    casual: "親しみやすい口語。SNS にもそのまま貼れるトーン。",
    marketing: "魅力訴求重視。誇張は避けつつ、買い手の心が動く表現。",
  }[tone];
  return `あなたは多言語ローカライゼーション専門の翻訳者です。
入力テキストを ${langLabel} に翻訳してください。

ルール:
- 原文の事実 / 意味を改変しない (翻訳のみ)
- ${toneGuide}
- 数値 / 固有名詞 / URL / 電話番号は原文どおり
- 用語集が与えられた場合は厳密に従う
- 改行構造は保持
- confidence は 0.0〜1.0 (専門用語が多い・短すぎる文は低め)`.trim();
}

/** 翻訳キャッシュ用の安定ハッシュ。crypto.subtle 非依存で動かすため簡易 djb2。 */
export function translationCacheKey(text: string, lang: TargetLang, tone?: string): string {
  const src = `${lang}|${tone ?? "formal"}|${text}`;
  let hash = 5381;
  for (let i = 0; i < src.length; i++) {
    hash = ((hash << 5) + hash + src.charCodeAt(i)) | 0;
  }
  return `tr_${lang}_${(hash >>> 0).toString(36)}`;
}
