import { logger } from "@/lib/logger";

const RESEND_API = "https://api.resend.com/emails";

export type ResendAttachment = {
  filename: string;
  /** base64-encoded file content */
  content: string;
};

export type ResendMessage = {
  from?: string;
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  reply_to?: string | string[];
  attachments?: ResendAttachment[];
  /**
   * Resend Idempotency-Key header value. Same key within ~24h returns the
   * cached result instead of re-sending. Required for safe retries from
   * webhooks/cron where the caller may retry the whole request.
   */
  idempotencyKey?: string;
};

export type ResendSendSuccess = { ok: true; id: string | null };
export type ResendSendFailure = { ok: false; status: number | null; error: string };
export type ResendSendResult = ResendSendSuccess | ResendSendFailure;

export function isResendFailure(r: ResendSendResult): r is ResendSendFailure {
  return r.ok === false;
}

type SendOptions = {
  /** default 2 (total tries = 3) */
  retries?: number;
  /** default 400ms, exponential: 400 / 800 / 1600 */
  baseBackoffMs?: number;
};

function jitter(ms: number): number {
  return ms + Math.floor(Math.random() * ms * 0.3);
}

/**
 * POST a Resend email with automatic retry on transient errors (network
 * failure, 429, 5xx). Requires RESEND_API_KEY at runtime; the message's
 * `from` defaults to RESEND_FROM.
 *
 * Retries are only triggered on failures Resend considers transient. Any
 * 4xx other than 429 is returned immediately without retry (bad input).
 */
export async function sendResendEmail(msg: ResendMessage, opts: SendOptions = {}): Promise<ResendSendResult> {
  const apiKey = (process.env.RESEND_API_KEY ?? "").trim();
  const defaultFrom = (process.env.RESEND_FROM ?? "").trim();
  const from = msg.from ?? defaultFrom;

  if (!apiKey) return { ok: false, status: null, error: "missing RESEND_API_KEY" };
  if (!from) return { ok: false, status: null, error: "missing RESEND_FROM" };

  const retries = opts.retries ?? 2;
  const baseBackoff = opts.baseBackoffMs ?? 400;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
  if (msg.idempotencyKey) headers["Idempotency-Key"] = msg.idempotencyKey;

  const payload: Record<string, unknown> = {
    from,
    to: msg.to,
    subject: msg.subject,
  };
  if (msg.html != null) payload.html = msg.html;
  if (msg.text != null) payload.text = msg.text;
  if (msg.reply_to != null) payload.reply_to = msg.reply_to;
  if (msg.attachments != null) payload.attachments = msg.attachments;

  let lastErr: { status: number | null; error: string } = { status: null, error: "unknown" };

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(RESEND_API, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        let id: string | null = null;
        try {
          const j = (await res.json()) as { id?: string };
          id = j.id ?? null;
        } catch {
          // body is not JSON; still treated as success
        }
        const success: ResendSendSuccess = { ok: true, id };
        return success;
      }

      const bodyText = await res.text().catch(() => "");
      lastErr = { status: res.status, error: bodyText.slice(0, 500) };

      // 4xx other than 429 => permanent, no point retrying
      if (res.status >= 400 && res.status < 500 && res.status !== 429) {
        logger.warn("resend permanent failure", { status: res.status, attempt });
        const failure: ResendSendFailure = { ok: false, status: res.status, error: bodyText.slice(0, 500) };
        return failure;
      }
      logger.warn("resend transient failure", { status: res.status, attempt });
    } catch (e: unknown) {
      lastErr = { status: null, error: e instanceof Error ? e.message : String(e) };
      logger.warn("resend network error", { attempt, err: lastErr.error });
    }

    if (attempt < retries) {
      await new Promise((r) => setTimeout(r, jitter(baseBackoff * 2 ** attempt)));
    }
  }

  const failure: ResendSendFailure = { ok: false, status: lastErr.status, error: lastErr.error };
  return failure;
}
