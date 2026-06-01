/**
 * 供給パートナーの発注 API へ実発注を投げる搬送層 (Phase 2)。
 *
 * 壁3: 発注の確定・送信 (= sent への遷移) は人の操作で初めて起きる。ここは
 * 「人が承認して送信したとき」に呼ばれ、搬送 (API or メール) だけを担う。
 * 数量・金額は発注書に確定済みのものをそのまま送る (作り直さない)。
 *
 * セキュリティ:
 *   - API 鍵は supply_partner_credentials (owner 専用 RLS) にあり店舗からは読めない。
 *     復号・送信はサーバ側 (service-role) が代行する。鍵はレスポンス・ログに出さない。
 *   - エンドポイントは https のみ + プライベート/ローカルホスト宛てを拒否 (SSRF 緩和)。
 *   - 外向き fetch は withRetry("supply:<id>") 経由 (指数バックオフ + circuit breaker)。
 */
import { withRetry } from "@/lib/http/withRetry";

export type SupplyAuthType = "none" | "api_key" | "bearer" | "oauth2";

export interface PlaceOrderItem {
  name: string;
  sku: string | null;
  quantity: number;
  unit_cost: number | null;
}

export interface PlaceOrderInput {
  poNumber: string;
  shopName: string;
  items: PlaceOrderItem[];
  subtotal: number;
  note: string | null;
}

export interface PlaceOrderApiConfig {
  endpoint: string;
  authType: SupplyAuthType;
  /** 復号済みの API 鍵 (none のときは null)。 */
  apiKey: string | null;
  /** 非機密の連携設定 (ヘッダ名・外部IDの取り出しパス等)。 */
  config?: Record<string, unknown> | null;
}

export interface PlaceOrderResult {
  ok: boolean;
  /** 先方が採番した注文番号 (取れれば)。 */
  externalOrderId: string | null;
  /** 失敗時の理由 (機密を含めない)。 */
  error?: string;
}

/**
 * 発注エンドポイントが安全か (SSRF 緩和)。https かつローカル/プライベート宛てでないこと。
 * 注: 完全な DNS リバインディング対策ではない (解決後 IP の検査は将来課題)。
 */
export function isSafeOrderEndpoint(rawUrl: string): boolean {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host === "::1" || host === "[::1]") return false;
  // IPv4 リテラルのプライベート / ループバック / リンクローカル / メタデータ
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    if (a === 127 || a === 10 || a === 0) return false;
    if (a === 169 && b === 254) return false; // link-local / cloud metadata
    if (a === 192 && b === 168) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
  }
  return true;
}

/** 認証方式に応じた HTTP ヘッダを組み立てる。config.header_name で API キーのヘッダ名を上書き可。 */
export function buildAuthHeaders(
  authType: SupplyAuthType,
  apiKey: string | null,
  config?: Record<string, unknown> | null,
): Record<string, string> {
  if (!apiKey) return {};
  switch (authType) {
    case "api_key": {
      const headerName = typeof config?.header_name === "string" ? config.header_name : "X-API-Key";
      return { [headerName]: apiKey };
    }
    case "bearer":
    case "oauth2": // MVP: 保存済みトークンを Bearer として使う
      return { Authorization: `Bearer ${apiKey}` };
    case "none":
    default:
      return {};
  }
}

/** 先方に送る発注ペイロード (汎用形)。先方仕様差は将来 config のマッピングで吸収。 */
export function buildOrderRequestBody(input: PlaceOrderInput): Record<string, unknown> {
  return {
    po_number: input.poNumber,
    shop_name: input.shopName,
    subtotal: input.subtotal,
    note: input.note ?? undefined,
    items: input.items.map((i) => ({
      sku: i.sku ?? undefined,
      name: i.name,
      quantity: i.quantity,
      unit_cost: i.unit_cost ?? undefined,
    })),
  };
}

/** レスポンス JSON から外部注文番号を取り出す。config.order_id_path (ドット区切り) 優先。 */
export function extractExternalOrderId(body: unknown, config?: Record<string, unknown> | null): string | null {
  if (body == null || typeof body !== "object") return null;
  const obj = body as Record<string, unknown>;
  const path = typeof config?.order_id_path === "string" ? config.order_id_path : null;
  const candidates = path ? [path] : ["order_id", "orderId", "id", "order_number", "orderNumber"];
  for (const key of candidates) {
    let cur: unknown = obj;
    for (const seg of key.split(".")) {
      if (cur != null && typeof cur === "object" && seg in (cur as Record<string, unknown>)) {
        cur = (cur as Record<string, unknown>)[seg];
      } else {
        cur = undefined;
        break;
      }
    }
    if (typeof cur === "string" && cur.trim()) return cur.trim();
    if (typeof cur === "number") return String(cur);
  }
  return null;
}

/**
 * 供給パートナーの発注 API へ POST する。withRetry 経由・タイムアウトつき。
 * API 未設定 (none / 鍵なし / エンドポイントなし) のときは ok=false / error="no_api" を返し、
 * 呼び出し側がメールフォールバックに切り替えられるようにする。
 */
export async function placeOrderViaApi(
  partnerId: string,
  api: PlaceOrderApiConfig,
  input: PlaceOrderInput,
): Promise<PlaceOrderResult> {
  if (api.authType === "none" || !api.apiKey || !api.endpoint) {
    return { ok: false, externalOrderId: null, error: "no_api" };
  }
  if (!isSafeOrderEndpoint(api.endpoint)) {
    return { ok: false, externalOrderId: null, error: "unsafe_endpoint" };
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
    ...buildAuthHeaders(api.authType, api.apiKey, api.config),
  };
  const payload = buildOrderRequestBody(input);

  try {
    const res = await withRetry(`supply:${partnerId}`, async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15_000);
      try {
        const r = await fetch(api.endpoint, {
          method: "POST",
          headers,
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
        if (!r.ok) {
          // 4xx/5xx は withRetry の既定 isRetryable が 5xx/429 のみ再試行する。
          const err = new Error(`supply order HTTP ${r.status}`) as Error & { status?: number };
          err.status = r.status;
          throw err;
        }
        const json = await r.json().catch(() => ({}));
        return json as unknown;
      } finally {
        clearTimeout(timer);
      }
    });

    return { ok: true, externalOrderId: extractExternalOrderId(res, api.config) };
  } catch (e) {
    const status = (e as { status?: number })?.status;
    return { ok: false, externalOrderId: null, error: status ? `http_${status}` : "request_failed" };
  }
}
