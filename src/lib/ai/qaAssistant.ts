/**
 * C-3: QAアシスタント（施工ナレッジ検索）
 *
 * 施工に関する質問に対し、Academy事例・マニュアルから
 * 関連情報を検索してClaudeが回答する（RAGパターン）。
 *
 * Note: pgvector が利用できない場合は全文検索フォールバック。
 */
import { getAnthropicClient, AI_MODEL, parseJsonResponse } from "@/lib/ai/client";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

// ─────────────────────────────────────────────
// 型定義
// ─────────────────────────────────────────────

export interface QAQuestion {
  question: string;
  category?: string; // 絞り込みカテゴリ（任意）
  tenantId: string;
}

export interface QASource {
  type: "case" | "manual" | "maker_doc";
  title: string;
  snippet: string;
  relevance: number;
}

export interface QAAnswer {
  answer: string;
  sources: QASource[];
  relatedCaseIds: string[];
  followUpQuestions: string[];
}

// ─────────────────────────────────────────────
// 関連ナレッジの検索（全文検索ベース）
// ─────────────────────────────────────────────

async function searchKnowledge(params: {
  question: string;
  category?: string;
  tenantId: string;
  limit?: number;
}): Promise<Array<{ content: string; source_type: string; source_id: string | null }>> {
  const admin = getSupabaseAdmin();

  // キーワード抽出（簡易版）
  const keywords = params.question
    .replace(/[？?。、]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 2)
    .slice(0, 5);

  let query = admin
    .from("knowledge_chunks")
    .select("content, source_type, source_id")
    .eq("is_active", true)
    .or(`tenant_id.is.null,tenant_id.eq.${params.tenantId}`);

  if (params.category) {
    query = query.eq("category", params.category);
  }

  // 全文検索（ilike）
  if (keywords.length > 0) {
    const orConditions = keywords.map((k) => `content.ilike.%${k}%`).join(",");
    query = query.or(orConditions);
  }

  const { data } = await query.limit(params.limit ?? 5);
  return data ?? [];
}

// ─────────────────────────────────────────────
// 公開Academy事例から関連事例を検索
// ─────────────────────────────────────────────

async function searchAcademyCases(params: {
  category?: string;
  limit?: number;
}): Promise<Array<{ id: string; ai_summary: string; tags: string[]; category: string }>> {
  const admin = getSupabaseAdmin();

  let query = admin
    .from("academy_cases")
    .select("id, ai_summary, tags, category")
    .eq("is_published", true)
    .order("quality_score", { ascending: false });

  if (params.category) {
    query = query.eq("category", params.category);
  }

  const { data } = await query.limit(params.limit ?? 3);
  return data ?? [];
}

// ─────────────────────────────────────────────
// QA回答生成
// ─────────────────────────────────────────────

export async function generateQAAnswer(input: QAQuestion): Promise<QAAnswer> {
  const client = getAnthropicClient();

  // 並列でナレッジ検索
  const [chunks, cases] = await Promise.all([
    searchKnowledge({
      question: input.question,
      category: input.category,
      tenantId: input.tenantId,
    }),
    searchAcademyCases({ category: input.category }),
  ]);

  // コンテキスト構築
  const contextParts: string[] = [];

  if (chunks.length > 0) {
    contextParts.push(
      "【参考情報】\n" + chunks.map((c, i) => `[${i + 1}] (${c.source_type}): ${c.content.slice(0, 200)}`).join("\n\n"),
    );
  }

  if (cases.length > 0) {
    contextParts.push(
      "【関連施工事例】\n" +
        cases.map((c) => `- [${c.category}] ${c.ai_summary ?? "事例あり"} (タグ: ${c.tags.join(", ")})`).join("\n"),
    );
  }

  const context = contextParts.join("\n\n") || "関連情報が見つかりませんでした。";

  const systemPrompt = `あなたはLedra Academyの施工技術QAアシスタントです。
自動車施工（コーティング・PPF・ボディリペアなど）に関する質問に、
提供されたナレッジベースを参照しながら回答してください。

必ず以下のJSON形式のみで回答してください:
{
  "answer": "回答本文（200文字以内、分かりやすく実践的に）",
  "followUpQuestions": ["関連して気になりそうな質問1", "関連して気になりそうな質問2"]
}

注意: ナレッジベースに情報がない場合は「この件については事例が少ないため、
メーカーに確認することを推奨します」など正直に答えてください。`;

  const userMessage = `【質問】
${input.question}
${input.category ? `【カテゴリ】${input.category}` : ""}

${context}`;

  try {
    const msg = await client.messages.create({
      model: AI_MODEL,
      max_tokens: 768,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    });

    const text = msg.content[0].type === "text" ? msg.content[0].text : "{}";
    const result = parseJsonResponse<{ answer: string; followUpQuestions: string[] }>(text);

    const sources: QASource[] = chunks.map((c, i) => ({
      type: c.source_type as QASource["type"],
      title: `参考情報 ${i + 1}`,
      snippet: c.content.slice(0, 100) + "...",
      relevance: 1 - i * 0.1,
    }));

    return {
      answer: result.answer ?? "回答を生成できませんでした。",
      sources,
      relatedCaseIds: cases.map((c) => c.id),
      followUpQuestions: result.followUpQuestions ?? [],
    };
  } catch (err) {
    console.error("[qaAssistant] error:", err);
    return {
      answer: "現在回答を生成できません。しばらく待ってから再度お試しください。",
      sources: [],
      relatedCaseIds: [],
      followUpQuestions: [],
    };
  }
}
