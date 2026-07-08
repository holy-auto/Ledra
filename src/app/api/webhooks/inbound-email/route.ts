import { NextRequest } from "next/server";
import crypto from "node:crypto";
import { apiOk, apiUnauthorized, apiError, apiValidationError, apiInternalError } from "@/lib/api/response";
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { claimWebhookEvent } from "@/lib/webhooks/idempotency";
import { recordInboundEmailMessage } from "@/lib/line/messageStore";
import { maybeAutoProcessInboundMessage } from "@/lib/ai/automation/inboundAuto";
import { parseInboundToken, parseMessageId, firstAddress } from "@/lib/email/inboundAddress";
import { logger, maskEmail } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * 受信メール Webhook (SendGrid Inbound Parse 等)。
 *
 * 店舗が予約メールを  yoyaku-<token>@<INBOUND_EMAIL_DOMAIN>  へ自動転送 → プロバイダが
 * multipart/form-data で POST してくる。宛先 token から tenant を解決し、本文を
 * customer_messages (channel="email") に記録して、LINE と同じ抽出→自動起票パス
 * (maybeAutoProcessInboundMessage) に合流させる。
 *
 * セキュリティ:
 *   - 受信 token 自体が推測困難 (128bit)。加えて INBOUND_EMAIL_WEBHOOK_SECRET を
 *     設定した場合は URL の ?key= と定数時間比較し、一致しなければ 401。
 *   - 未知 / 無効テナント宛は 200 で握りつぶす (バックスキャッタ防止・再送抑止)。
 */
function timingSafeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

const HTML_ENTITIES: Record<string, string> = {
  nbsp: " ",
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  "#39": "'",
};

/**
 * HTML しか無い場合の素朴なテキスト化 (フォールバック)。
 *
 * タグ除去は**1 文字ずつの単一走査 (O(n))**。`<[^>]*>` のような正規表現は、閉じない
 * 大量の '<' を含む送信者制御 HTML で各 '<' から末尾まで再走査され超線形になり、
 * webhook ワーカーを数秒ブロックして再送を誘発しうる。ここでは状態機械で走査するため
 * その病的ケースでも線形。エンティティ復元は単一パスで二重復元を避ける。
 * html は text/plain が無い場合のフォールバックであり、多少のノイズは実害なし。
 */
function htmlToText(html: string | null): string {
  if (!html) return "";
  const src = html.slice(0, 100_000); // 冒頭のみで抽出には十分。
  let out = "";
  let inTag = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inTag) {
      if (ch === ">") inTag = false; // タグ終端。中身は捨てる。
    } else if (ch === "<") {
      inTag = true;
      out += " ";
    } else {
      out += ch;
    }
  }
  return out
    .replace(/&(nbsp|amp|lt|gt|quot|apos|#39);/gi, (m, e: string) => HTML_ENTITIES[e.toLowerCase()] ?? m)
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * 受信メールの Date ヘッダ (無ければ envelope) から JST の受信日 (YYYY-MM-DD) を得る。
 * 相対日付 ("明日") はこの日付基準で解釈する。再送/遅延/古いメール転送でも、処理日では
 * なくメール本来の日付を使う。解釈できなければ null。
 */
function parseEmailDateJst(rawHeaders: string | null | undefined): string | null {
  if (!rawHeaders) return null;
  const m = rawHeaders.match(/^date:\s*(.+)$/im);
  if (!m) return null;
  const d = new Date(m[1].trim());
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Tokyo" });
}

/** Asia/Tokyo の今日 (YYYY-MM-DD)。相対日付の基準。 */
function todayJst(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Tokyo" });
}

export async function POST(req: NextRequest) {
  try {
    // 共有シークレット (任意)。設定時のみ URL ?key= を検証する。
    const secret = process.env.INBOUND_EMAIL_WEBHOOK_SECRET;
    if (secret) {
      const provided = req.nextUrl.searchParams.get("key") ?? "";
      if (!timingSafeEqual(provided, secret)) return apiUnauthorized();
    }

    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return apiValidationError("multipart/form-data を解釈できません");
    }
    const getStr = (k: string): string | null => {
      const v = form.get(k);
      return typeof v === "string" ? v : null;
    };

    // 宛先: envelope.to (実 RCPT TO) を優先、無ければ To ヘッダ。
    let recipients: string | string[] = getStr("to") ?? "";
    const envelope = getStr("envelope");
    if (envelope) {
      try {
        const e = JSON.parse(envelope) as { to?: unknown };
        if (Array.isArray(e.to)) recipients = e.to.filter((x): x is string => typeof x === "string");
      } catch {
        /* envelope 不正なら To ヘッダにフォールバック */
      }
    }
    const token = parseInboundToken(recipients);
    if (!token) return apiOk({ ignored: "no_token" });

    // token → tenant。有効化済み & アクティブのみ受理。
    const admin = createServiceRoleAdmin("Inbound email webhook — no auth session");
    const { data: tenant, error: tenantErr } = await admin
      .from("tenants")
      .select("id, is_active, email_inbound_enabled")
      .eq("email_inbound_token", token)
      .maybeSingle();
    if (tenantErr) {
      // DB 一時障害等。200 で「無効テナント」と誤判定するとメールが恒久的に失われるため、
      // 5xx を返してプロバイダに再送させる。
      return apiError({ code: "internal_error", message: "一時的に処理できません。再送してください。", status: 503 });
    }
    if (!tenant || tenant.is_active === false || !tenant.email_inbound_enabled) {
      return apiOk({ ignored: "tenant_not_enabled" });
    }
    const tenantId = tenant.id as string;

    // 本文・送信元。
    const fromField = getStr("from");
    const fromEmail = firstAddress(fromField);
    const subject = getStr("subject");
    const bodyText = (getStr("text") || htmlToText(getStr("html")) || "").trim();
    if (!bodyText) return apiOk({ ignored: "empty_body" });

    // 冪等化キーは **テナント単位** にスコープする。同一 Message-ID が複数テナントの
    // エイリアス宛に届いた場合でも、2 番目以降を重複として落とさないため。
    const messageId = parseMessageId(getStr("headers")) ?? getStr("Message-Id") ?? getStr("message-id");
    const eventId =
      `${tenantId}:` +
      (messageId ??
        "sha256:" +
          crypto
            .createHash("sha256")
            .update(`${fromEmail ?? ""}\n${subject ?? ""}\n${bodyText.slice(0, 2000)}`)
            .digest("hex"));
    const claim = await claimWebhookEvent(admin, "inbound-email", eventId, "inbound");
    if (claim === "duplicate") return apiOk({ duplicate: true });
    if (claim === "error") {
      // claim 失敗 → 5xx を返してプロバイダに再送させる (重複処理より再送が安全)。
      return apiError({ code: "internal_error", message: "一時的に処理できません。再送してください。", status: 503 });
    }

    // 保存用は件名 + 本文。長すぎる転送履歴は上限で丸める。
    const stored = await recordInboundEmailMessage({
      tenantId,
      fromEmail,
      subject,
      body: `${subject ? `件名: ${subject}\n\n` : ""}${bodyText}`.slice(0, 20000),
      messageId,
    });
    // 受信箱への保存に失敗したら、既に取得した冪等 claim を解放してから 5xx を返す。
    // 解放しないと再送が「重複」で握り潰され、メッセージが恒久的に失われる。
    if (!stored.ok) {
      await admin
        .from("webhook_processed_events")
        .delete()
        .eq("provider", "inbound-email")
        .eq("event_id", eventId)
        .then(undefined, () => undefined);
      return apiError({ code: "internal_error", message: "保存に失敗しました。再送してください。", status: 503 });
    }

    // LINE と同じ抽出→自動起票パスに合流 (複合認識・自動起票はテナント設定次第)。
    // From (送信元) は顧客同定にも文脈キーにも使わない (転送 From は no-reply が多く、
    // 別顧客の履歴混入や重複顧客を招くため)。顧客同定は AI 抽出結果に委ねる。
    await maybeAutoProcessInboundMessage({
      tenantId,
      messageId: stored.id ?? null,
      customerId: null,
      text: `${subject ? `件名: ${subject}\n` : ""}${bodyText}`,
      channel: "email",
      // 相対日付はメール本来の Date 基準 (再送/遅延/古いメール転送での取り違え防止)。
      receivedDate: parseEmailDateJst(getStr("headers")) ?? todayJst(),
    });

    logger.info("[inbound-email] processed", {
      tenantId,
      from: fromEmail ? maskEmail(fromEmail) : null,
      message_id: messageId ?? null,
    });
    return apiOk({ ok: true });
  } catch (e) {
    return apiInternalError(e, "inbound-email webhook");
  }
}
