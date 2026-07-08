/**
 * Square 注文や外部 POS 取り込み時の顧客ファジーマッチ。
 *
 * 既存の名前完全一致では取りこぼす「山田たろう」「ヤマダ タロウ」「ヤマダ」など
 * の表記揺れを deterministic な類似度 (Dice 係数 + 電話/メール一致ボーナス) で
 * 拾い、複数候補がある場合のみ Haiku に最終判定させる。
 */
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { withRetry } from "@/lib/http/withRetry";
import { getAnthropicClient, AI_MODEL_FAST } from "@/lib/ai/client";
import { normalizeCustomerName } from "@/lib/ai/textNormalize";

export interface CustomerCandidate {
  id: string;
  name: string;
  name_kana?: string | null;
  phone?: string | null;
  email?: string | null;
}

export interface FuzzyMatchInput {
  /** 外部システムから取り込んだ「不明な名前」 */
  query: { name?: string | null; phone?: string | null; email?: string | null };
  /** 自テナントの候補 */
  candidates: CustomerCandidate[];
}

export interface FuzzyMatchScored {
  candidate: CustomerCandidate;
  score: number;
  reasons: string[];
}

export interface FuzzyMatchResult {
  best?: FuzzyMatchScored;
  alternatives: FuzzyMatchScored[];
  /** 0.85 以上 = ほぼ確実 / 0.6〜0.85 = 確認推奨 / 0.6 未満 = 新規顧客扱い推奨 */
  confidence: number;
  method: "exact" | "phone_email" | "fuzzy" | "ai" | "none";
  ai: boolean;
}

/** Dice 係数 (2-gram) で 0〜1 の文字列類似度を返す。 */
export function diceSimilarity(a: string, b: string): number {
  const na = normalizeCustomerName(a) ?? "";
  const nb = normalizeCustomerName(b) ?? "";
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const grams = (s: string) => {
    const out = new Set<string>();
    for (let i = 0; i < s.length - 1; i++) out.add(s.slice(i, i + 2));
    return out;
  };
  const ga = grams(na);
  const gb = grams(nb);
  if (ga.size === 0 || gb.size === 0) return 0;
  let intersect = 0;
  for (const g of ga) if (gb.has(g)) intersect++;
  return (2 * intersect) / (ga.size + gb.size);
}

const RankedSchema = z.object({
  best_id: z.string().optional(),
  reason: z.string().max(140),
  confidence: z.number().min(0).max(1),
});

export async function fuzzyMatchCustomer(
  input: FuzzyMatchInput,
  opts?: { model?: string; ai?: boolean },
): Promise<FuzzyMatchResult> {
  // バルク取込 (ingest / CSV) では 1 バッチ数百件になり得るため、AI 判定を
  // 明示的に無効化して決定的マッチ (電話/メール完全一致 + Dice 類似度) のみで
  // 判断できるようにする。既定は AI 併用 (Square 単発リンク等)。
  const useAi = opts?.ai !== false;
  // 1. exact match (name + phone or email)
  for (const c of input.candidates) {
    if (input.query.phone && c.phone && stripPhone(c.phone) === stripPhone(input.query.phone)) {
      return {
        best: { candidate: c, score: 1, reasons: ["電話番号完全一致"] },
        alternatives: [],
        confidence: 1,
        method: "phone_email",
        ai: false,
      };
    }
    if (input.query.email && c.email && c.email.toLowerCase() === input.query.email.toLowerCase()) {
      return {
        best: { candidate: c, score: 1, reasons: ["メールアドレス完全一致"] },
        alternatives: [],
        confidence: 1,
        method: "phone_email",
        ai: false,
      };
    }
  }

  // 2. fuzzy score
  const scored: FuzzyMatchScored[] = [];
  for (const c of input.candidates) {
    const nameSim = input.query.name ? diceSimilarity(input.query.name, c.name) : 0;
    const kanaSim = input.query.name && c.name_kana ? diceSimilarity(input.query.name, c.name_kana) : 0;
    const score = Math.max(nameSim, kanaSim * 0.95);
    const reasons: string[] = [];
    if (nameSim > 0.5) reasons.push(`氏名類似度 ${Math.round(nameSim * 100)}%`);
    if (kanaSim > 0.5) reasons.push(`カナ類似度 ${Math.round(kanaSim * 100)}%`);
    if (score > 0.3) scored.push({ candidate: c, score, reasons });
  }
  scored.sort((a, b) => b.score - a.score);
  const top = scored[0];
  if (!top) {
    return { alternatives: [], confidence: 0, method: "none", ai: false };
  }
  // 3. もし top.score が圧倒的なら確定。複数が近接していたら AI 判定。
  const second = scored[1];
  const isConfident = top.score >= 0.85 && (!second || second.score < top.score - 0.15);
  if (isConfident || scored.length === 1) {
    return {
      best: top,
      alternatives: scored.slice(1, 4),
      confidence: top.score,
      method: "fuzzy",
      ai: false,
    };
  }

  if (!useAi || !process.env.ANTHROPIC_API_KEY) {
    return {
      best: top,
      alternatives: scored.slice(1, 4),
      confidence: top.score,
      method: "fuzzy",
      ai: false,
    };
  }

  // 4. AI に絞り込ませる
  const client = getAnthropicClient();
  const facts = scored
    .slice(0, 5)
    .map(
      (s) =>
        `- id=${s.candidate.id} name=${s.candidate.name} kana=${s.candidate.name_kana ?? ""} phone=${s.candidate.phone ?? ""} email=${s.candidate.email ?? ""} score=${s.score.toFixed(2)}`,
    );
  try {
    const msg = await withRetry("anthropic", () =>
      client.messages.parse({
        model: opts?.model ?? AI_MODEL_FAST,
        max_tokens: 384,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: `照合対象:\n名前: ${input.query.name ?? "(不明)"}\n電話: ${input.query.phone ?? "(不明)"}\nメール: ${input.query.email ?? "(不明)"}\n\n候補:\n${facts.join("\n")}`,
          },
        ],
        output_config: { format: zodOutputFormat(RankedSchema) },
      }),
    );
    const parsed = msg.parsed_output;
    if (!parsed)
      return { best: top, alternatives: scored.slice(1, 4), confidence: top.score, method: "fuzzy", ai: false };
    const bestMatch = parsed.best_id ? scored.find((s) => s.candidate.id === parsed.best_id) : undefined;
    if (!bestMatch) {
      return {
        best: undefined,
        alternatives: scored.slice(0, 4),
        confidence: parsed.confidence,
        method: "ai",
        ai: true,
      };
    }
    return {
      best: { ...bestMatch, reasons: [...bestMatch.reasons, parsed.reason] },
      alternatives: scored.filter((s) => s.candidate.id !== bestMatch.candidate.id).slice(0, 3),
      confidence: parsed.confidence,
      method: "ai",
      ai: true,
    };
  } catch (err) {
    console.error("[customerFuzzyMatch] failed:", err);
    return { best: top, alternatives: scored.slice(1, 4), confidence: top.score, method: "fuzzy", ai: false };
  }
}

const SYSTEM_PROMPT = `あなたは自動車施工店のデータ整備担当です。
外部 POS から取り込んだ「不明な顧客」と、自店の顧客マスタ候補を見て、
同一人物の可能性が最も高い顧客 1 件を選び、確信度を 0.0〜1.0 で返してください。

ルール:
- 与えた候補 id の中から 1 件、または best_id を省略 (該当なし) のいずれか
- 名前の漢字 / カタカナ / ローマ字違いは同一視 OK
- 苗字だけ一致 + 名前不明 のような弱い手がかりは 0.5 以下
- 電話 / メールが一致していれば 0.9 以上`.trim();

function stripPhone(p: string): string {
  return p.replace(/[\s\-()+]/g, "");
}
