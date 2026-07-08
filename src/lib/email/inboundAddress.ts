/**
 * メール予約取り込みの受信アドレス補助。
 *
 * 各テナントに  yoyaku-<token>@<INBOUND_EMAIL_DOMAIN>  という受信アドレスを発行し、
 * 店舗はそこへ予約メールを自動転送する。受信 Webhook (SendGrid Inbound Parse 等) は
 * 宛先アドレスの token から tenant を解決する。
 *
 * ドメインは Ledra 側が所有するサブドメイン (例: parse.ledra.app) を想定し、
 * その MX を Inbound Parse プロバイダに向ける。店舗側の DNS 設定は不要。
 */
import crypto from "node:crypto";

const LOCAL_PREFIX = "yoyaku-";

/** 受信ドメイン (MX を Inbound Parse に向けたサブドメイン)。未設定なら空文字。 */
export function inboundEmailDomain(): string {
  return (process.env.INBOUND_EMAIL_DOMAIN || "").trim().toLowerCase();
}

/** token から受信アドレスを組み立てる。ドメイン未設定 / token 無しなら null。 */
export function buildInboundAddress(token: string | null | undefined): string | null {
  const domain = inboundEmailDomain();
  if (!domain || !token) return null;
  return `${LOCAL_PREFIX}${token}@${domain}`;
}

/** "Name <a@b>, c@d" 形式の1フィールドからメールアドレスだけを小文字で抜き出す。 */
export function extractAddresses(field: string): string[] {
  if (!field) return [];
  const out: string[] = [];
  // <...> があればその中身、無ければ素の addr トークンを拾う。
  const re = /<([^>]+)>|([^\s,;<>]+@[^\s,;<>]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(field)) !== null) {
    const addr = (m[1] || m[2] || "").trim().toLowerCase();
    if (addr.includes("@")) out.push(addr);
  }
  return out;
}

/**
 * 宛先 (To / envelope.to) 群から自ドメイン宛の token を取り出す。無ければ null。
 * plus-addressing (yoyaku-<token>+tag@dom) にも耐える。
 */
export function parseInboundToken(recipients: string | string[] | null | undefined): string | null {
  const domain = inboundEmailDomain();
  if (!domain) return null;
  const list = Array.isArray(recipients) ? recipients : [recipients ?? ""];
  for (const raw of list) {
    for (const addr of extractAddresses(raw)) {
      const at = addr.lastIndexOf("@");
      if (at < 0) continue;
      if (addr.slice(at + 1) !== domain) continue;
      const local = addr.slice(0, at).split("+")[0]; // +tag を除去
      if (!local.startsWith(LOCAL_PREFIX)) continue;
      const token = local.slice(LOCAL_PREFIX.length);
      if (token) return token;
    }
  }
  return null;
}

/** From ヘッダなどからメールアドレスを1件取り出す。 */
export function firstAddress(field: string | null | undefined): string | null {
  const [a] = extractAddresses(field ?? "");
  return a ?? null;
}

/** From ヘッダから表示名 (顧客名候補) を取り出す。アドレスしか無ければ null。 */
export function displayName(field: string | null | undefined): string | null {
  if (!field) return null;
  const m = field.match(/^\s*"?([^"<]+?)"?\s*</);
  const name = m?.[1]?.trim();
  return name && !name.includes("@") ? name : null;
}

/** 生の RFC822 ヘッダ文字列から Message-ID を取り出す (冪等化キー用)。 */
export function parseMessageId(rawHeaders: string | null | undefined): string | null {
  if (!rawHeaders) return null;
  const m = rawHeaders.match(/^message-id:\s*(.+)$/im);
  return m?.[1]?.trim() || null;
}

/** 新しい受信トークンを生成 (128bit hex)。 */
export function generateInboundToken(): string {
  return crypto.randomBytes(16).toString("hex");
}
