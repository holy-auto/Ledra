/**
 * 共有 Anthropic クライアント
 * - シングルトンパターンでインスタンスを管理
 * - 全AIモジュールはこのクライアントを通じてClaudeにアクセスする
 * - SDK 内蔵 retry は無効化し、withRetry("anthropic", ...) に委譲する
 *   (一過性 5xx / 429 の自動回復 + circuit breaker)
 */
import Anthropic from "@anthropic-ai/sdk";
import { addUsageFromMessage } from "@/lib/ai/usageContext";

let _client: Anthropic | null = null;

/**
 * messages.create をラップし、各呼び出しの usage を
 * リクエスト単位のキャプチャ (usageContext) に積む。ヘルパ側は変更不要。
 *
 * SDK の `messages.parse` は内部で `this.create` を呼ぶ (create→parseMessage) ため、
 * create だけをラップすれば parse 経由の呼び出しも漏れなく 1 回だけ計上される
 * (parse も同時にラップすると同一レスポンスを二重計上してしまう)。
 * キャプチャ未開始 (ALS ストア無し) のときは no-op。集計失敗は握りつぶす。
 */
function wrapForUsageCapture(client: Anthropic): Anthropic {
  const messages = client.messages as unknown as Record<string, (...args: unknown[]) => unknown>;
  const origCreate = messages.create.bind(messages);

  messages.create = (...args: unknown[]) => {
    const p = origCreate(...args);
    // 返り値 (SDK の APIPromise) はそのまま返す。Promise.resolve().then() で包み直すと
    // parse が依存する APIPromise のメソッドが失われ得るため、結果は detached な
    // .then 観測でのみ usage を積む (返り値は変えない)。stream は then を持たないので skip。
    if (p && typeof (p as { then?: unknown }).then === "function") {
      (p as PromiseLike<unknown>).then(
        (res) => {
          try {
            addUsageFromMessage(res as Parameters<typeof addUsageFromMessage>[0]);
          } catch {
            /* usage 集計は best-effort */
          }
        },
        () => {
          /* エラーは呼び出し側で処理。未処理 rejection 回避のため no-op */
        },
      );
    }
    return p;
  };

  return client;
}

export function getAnthropicClient(): Anthropic {
  if (!_client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
    _client = wrapForUsageCapture(
      new Anthropic({
        apiKey,
        timeout: 60_000,
        maxRetries: 0,
      }),
    );
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
 * プランに応じた AI モデルを返す。
 * Starter は Haiku（低コスト）、Standard は Sonnet、Pro は Opus。
 * コスト構造: Starter ¥9,800 に対し Haiku コストは月数百円程度。
 */
export function modelForPlanTier(planTier: string | null | undefined): string {
  const tier = String(planTier ?? "").toLowerCase();
  switch (tier) {
    case "starter":
    case "mini":
      return AI_MODEL_FAST;
    case "standard":
      return AI_MODEL;
    case "pro":
      return AI_MODEL_CRITICAL;
    default:
      return AI_MODEL_FAST;
  }
}

/**
 * 軽量タスク（分類・スコアリング・抽出等）のプラン別モデル。
 * Starter は Haiku、Standard/Pro は Sonnet に昇格。
 * Opus は軽量タスクにはオーバースペックなので使わない。
 */
export function fastModelForPlanTier(planTier: string | null | undefined): string {
  const tier = String(planTier ?? "").toLowerCase();
  switch (tier) {
    case "standard":
    case "pro":
      return AI_MODEL;
    default:
      return AI_MODEL_FAST;
  }
}

/**
 * プランに応じた Vision モデルを返す。
 * Starter は Haiku（Vision 対応）、Standard+ は Sonnet。
 */
export function visionModelForPlanTier(planTier: string | null | undefined): string {
  const tier = String(planTier ?? "").toLowerCase();
  switch (tier) {
    case "starter":
    case "mini":
      return AI_MODEL_FAST;
    default:
      return AI_MODEL_VISION;
  }
}

/**
 * 信頼性・法的に重要で「低頻度」なパス専用の最高精度モデル (既定 Opus)。
 *
 * 用途: 写真改ざんの最終判定、身分証 OCR の低信頼ケースの昇格 (escalation) など。
 * これらは 1 証明書あたりの呼び出しが少ないため、Opus でも店舗あたりの
 * 総額影響は小さい = 「効くところにだけ最大火力」。
 *
 * コスト/レイテンシを抑えたい場合は env `AI_CRITICAL_MODEL` で Sonnet 等に
 * 差し替え可能 (例: AI_CRITICAL_MODEL=claude-sonnet-4-6)。
 */
export const AI_MODEL_CRITICAL: string = process.env.AI_CRITICAL_MODEL?.trim() || "claude-opus-4-8";

/** 低信頼時に AI_MODEL_CRITICAL へ昇格する既定しきい値 (env で調整可)。 */
export const AI_ESCALATE_THRESHOLD: number = (() => {
  const n = Number(process.env.AI_ESCALATE_THRESHOLD);
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : 0.7;
})();

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
