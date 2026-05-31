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

/**
 * 静的な system プロンプトを prompt caching 対象 (ephemeral / 既定 5 分 TTL) として
 * ラップする。同じ指示文を毎回フルで送り直す代わりに Anthropic 側でキャッシュさせ、
 * 短時間に繰り返し呼ばれるエンドポイント (証明書下書き・身分証 OCR 等) の
 * 入力トークンコストを削減する (キャッシュ読込は通常の入力単価の約 1/10)。
 *
 * 注意:
 * - キャッシュは「cache_control までの累計トークン」が最小長
 *   (Sonnet/Opus = 1024, Haiku = 2048 tokens) を超えた場合のみ有効。
 *   下回る場合は API 側で黙って無視され、追加課金も発生しない (no-op)。
 * - 必ず「静的な」指示文に対してのみ使うこと。per-request の動的値を
 *   埋め込むと毎回キャッシュミスになり意味がない (動的値は user メッセージへ)。
 */
export function cacheableSystem(text: string) {
  return [{ type: "text" as const, text, cache_control: { type: "ephemeral" as const } }];
}
