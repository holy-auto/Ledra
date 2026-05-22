/**
 * 共有 Anthropic クライアント
 * - シングルトンパターンでインスタンスを管理
 * - 全AIモジュールはこのクライアントを通じてClaudeにアクセスする
 * - SDK 内蔵 retry は無効化し、withRetry("anthropic", ...) に委譲する
 *   (一過性 5xx / 429 の自動回復 + circuit breaker)
 */
import Anthropic from "@anthropic-ai/sdk";

let _client: Anthropic | null = null;

export function getAnthropicClient(): Anthropic {
  if (!_client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
    _client = new Anthropic({
      apiKey,
      timeout: 60_000,
      maxRetries: 0,
    });
  }
  return _client;
}

/** テキスト生成タスク用デフォルトモデル */
export const AI_MODEL = "claude-sonnet-4-6" as const;

/** 高速・軽量タスク用モデル (写真チェック・スコアリング等) */
export const AI_MODEL_FAST = "claude-haiku-4-5" as const;

/** Vision対応モデル */
export const AI_MODEL_VISION = "claude-sonnet-4-6" as const;
