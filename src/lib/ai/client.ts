/**
 * 共有 Anthropic クライアント
 * - シングルトンパターンでインスタンスを管理
 * - 全AIモジュールはこのクライアントを通じてClaudeにアクセスする
 */
import Anthropic from "@anthropic-ai/sdk";

let _client: Anthropic | null = null;

export function getAnthropicClient(): Anthropic {
  if (!_client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
    _client = new Anthropic({ apiKey });
  }
  return _client;
}

/** テキスト生成タスク用デフォルトモデル */
export const AI_MODEL = "claude-opus-4-5" as const;

/** 高速・軽量タスク用モデル (写真チェック・スコアリング等) */
export const AI_MODEL_FAST = "claude-haiku-4-5" as const;

/** Vision対応モデル */
export const AI_MODEL_VISION = "claude-opus-4-5" as const;

/**
 * JSON出力を安全にパース（コードフェンスを除去）
 */
export function parseJsonResponse<T = unknown>(text: string): T {
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
  return JSON.parse(cleaned) as T;
}
