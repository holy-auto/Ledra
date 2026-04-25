/**
 * Structured logger with correlationId propagation.
 *
 * 使い方:
 * ```ts
 * import { logger } from "@/lib/logger";
 *
 * const log = logger.child({ route: "stripe.webhook", requestId });
 * log.info("event received", { eventId: event.id, type: event.type });
 * log.warn("retry needed", { reason: "idempotency_claim_failed" });
 * log.error("unhandled", err, { tenantId });
 * ```
 *
 * - JSON 一行 / Vercel の Log Drains や Sentry breadcrumb と親和性あり
 * - `child()` で context を継承した子ロガーを作れる
 * - エラーオブジェクトは `message` / `stack` / `code` を安全に抽出
 * - 秘密情報 (*_SECRET, *_KEY, *_TOKEN, pepper, password, authorization)
 *   を含むキーは自動マスクする
 *
 * correlationId は middleware 等で `x-request-id` header から生成し、
 * `logger.child({ requestId })` として取り回す想定。
 */

type Level = "debug" | "info" | "warn" | "error";

type LogContext = Record<string, unknown>;

const SECRET_KEY_RE = /(secret|token|pepper|password|authorization|api[_-]?key|private[_-]?key)/i;

function mask(value: unknown): unknown {
  if (typeof value !== "string") return value;
  if (value.length <= 8) return "***";
  return `${value.slice(0, 3)}***${value.slice(-2)}`;
}

function sanitize(obj: LogContext): LogContext {
  const out: LogContext = {};
  for (const [k, v] of Object.entries(obj)) {
    if (SECRET_KEY_RE.test(k)) {
      out[k] = mask(v);
      continue;
    }
    if (v && typeof v === "object" && !Array.isArray(v) && !(v instanceof Error)) {
      out[k] = sanitize(v as LogContext);
      continue;
    }
    out[k] = v;
  }
  return out;
}

function errorToJson(err: unknown): LogContext {
  if (!err) return {};
  if (err instanceof Error) {
    const j: LogContext = { name: err.name, message: err.message };
    if (err.stack) j.stack = err.stack;
    const maybeCode = (err as { code?: unknown }).code;
    if (maybeCode !== undefined) j.code = maybeCode;
    return { error: j };
  }
  if (typeof err === "object") {
    return { error: sanitize(err as LogContext) };
  }
  return { error: String(err) };
}

function emit(level: Level, baseCtx: LogContext, msg: string, extra?: LogContext, err?: unknown) {
  const record = {
    level,
    msg,
    ts: new Date().toISOString(),
    ...sanitize(baseCtx),
    ...(extra ? sanitize(extra) : {}),
    ...errorToJson(err),
  };

  const line = JSON.stringify(record);
  switch (level) {
    case "debug":
      if (process.env.NODE_ENV !== "production") console.debug(line);
      break;
    case "info":
      console.info(line);
      break;
    case "warn":
      console.warn(line);
      break;
    case "error":
      console.error(line);
      break;
  }
}

export type Logger = {
  debug(msg: string, ctx?: LogContext): void;
  info(msg: string, ctx?: LogContext): void;
  warn(msg: string, ctx?: LogContext): void;
  error(msg: string, err?: unknown, ctx?: LogContext): void;
  child(ctx: LogContext): Logger;
};

function make(base: LogContext): Logger {
  return {
    debug: (msg, ctx) => emit("debug", base, msg, ctx),
    info: (msg, ctx) => emit("info", base, msg, ctx),
    warn: (msg, ctx) => emit("warn", base, msg, ctx),
    error: (msg, err, ctx) => emit("error", base, msg, ctx, err),
    child: (ctx) => make({ ...base, ...ctx }),
  };
}

export const logger: Logger = make({});

/**
 * メールアドレスをログ用に部分マスクする。
 * 例: "alice@example.com" → "al***@example.com"
 *     "x@y.com"           → "***@y.com"
 *     null / 空文字        → "***"
 *
 * メールアドレスは PII。ログ・Sentry 等に流す前に必ずこれを通す。
 */
export function maskEmail(email: string | null | undefined): string {
  if (!email) return "***";
  const at = email.indexOf("@");
  if (at <= 0) return "***";
  const local = email.slice(0, at);
  const domain = email.slice(at);
  const visible = Math.min(2, local.length);
  return local.slice(0, visible) + "***" + domain;
}

/**
 * Generate or propagate a request id.
 * middleware で呼び、logger.child({ requestId }) として使う。
 */
export function resolveRequestId(req: { headers: Headers }): string {
  const h = req.headers.get("x-request-id") ?? req.headers.get("x-vercel-id");
  if (h && /^[A-Za-z0-9._:=+/-]{8,128}$/.test(h)) return h;
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}
