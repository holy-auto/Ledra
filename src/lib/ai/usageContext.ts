/**
 * リクエスト単位の AI トークン使用量キャプチャ (AsyncLocalStorage)。
 *
 * 目的: 各 AI ヘルパ (約30個) を書き換えずに、1 リクエスト内の Anthropic 呼び出しの
 *       input/output/cache トークンを集計し、ai_usage_logs への記録とコストキャップに
 *       渡せるようにする。
 *
 * 仕組み:
 *   - `startAiRouteUsage()` が `beginAiUsageCapture()` を呼び、現在の非同期コンテキストに
 *     空のアキュムレータを `enterWith` で束ねる (callback ラップ不要)。
 *   - 共有 Anthropic クライアント (client.ts) が messages.parse / create の結果を
 *     `addUsageFromMessage(res)` で積む。res.usage / res.model から取得。
 *   - `usage.record()` が `getCapturedUsage()` で集計値を読み、トークン/モデル/コストに使う。
 *
 * 並行リクエストは各々別の非同期コンテキストを持つため、ストアは混ざらない。
 * runtime = "nodejs" のルート専用 (Edge には async_hooks が無い)。
 */
import { AsyncLocalStorage } from "async_hooks";
import { estimateCostJpy } from "./pricing";

export interface AiUsageCapture {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  /**
   * 呼び出しごとに「その呼び出しのモデル単価」で算出したコスト (円) の累計。
   * 1 リクエストで複数モデル (例: OCR の Sonnet→Opus 昇格) を呼んでも、
   * 各パスを正しい単価で積むため model 上書きによる過大計上を避けられる。
   */
  costJpy: number;
  /** 最後に観測したモデル (ログ表示用の参考値)。コスト計算には使わない。 */
  model: string | null;
  calls: number;
}

const als = new AsyncLocalStorage<AiUsageCapture>();

/** 現在の非同期コンテキストに空のキャプチャを束ねる (リクエスト開始時に呼ぶ)。 */
export function beginAiUsageCapture(): void {
  als.enterWith({
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    costJpy: 0,
    model: null,
    calls: 0,
  });
}

/** 集計値を取得 (キャプチャ未開始なら undefined)。 */
export function getCapturedUsage(): AiUsageCapture | undefined {
  return als.getStore();
}

interface AnthropicMessageLike {
  usage?: {
    input_tokens?: number | null;
    output_tokens?: number | null;
    cache_read_input_tokens?: number | null;
    cache_creation_input_tokens?: number | null;
  } | null;
  model?: string | null;
}

/** Anthropic のレスポンス (Message) から usage / model を集計に加える。 */
export function addUsageFromMessage(msg: AnthropicMessageLike | null | undefined): void {
  const store = als.getStore();
  if (!store || !msg?.usage) return;
  const u = msg.usage;
  const inputTokens = u.input_tokens ?? 0;
  const outputTokens = u.output_tokens ?? 0;
  const cacheReadTokens = u.cache_read_input_tokens ?? 0;
  const cacheWriteTokens = u.cache_creation_input_tokens ?? 0;
  store.inputTokens += inputTokens;
  store.outputTokens += outputTokens;
  store.cacheReadTokens += cacheReadTokens;
  store.cacheWriteTokens += cacheWriteTokens;
  // この呼び出しのモデル単価でコストを積む (モデル混在でも正しく合算)。
  store.costJpy += estimateCostJpy(msg.model ?? null, {
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheWriteTokens,
  });
  if (msg.model) store.model = msg.model;
  store.calls += 1;
}
