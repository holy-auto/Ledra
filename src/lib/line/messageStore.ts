import { createServiceRoleAdmin, createTenantScopedAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

/**
 * customer_messages 表に対する永続化ヘルパ。
 *
 * LINE Webhook (inbound) と管理画面の Push 送信 (outbound) の両方で使う。
 * customer_id が分からない場合 (LINE 友だち追加直後など) は line_user_id だけ
 * で挿入する。後から customers.line_user_id でリンクできる。
 */

export interface InboundLineMessage {
  tenantId: string;
  lineUserId: string;
  body: string;
  rawEvent?: unknown;
  lineMessageId?: string | null;
  lineTimestampMs?: number | null;
  /** line-media バケット内の添付保存パス (画像受信時) */
  attachmentPath?: string | null;
  attachmentContentType?: string | null;
}

export interface OutboundLineMessage {
  tenantId: string;
  lineUserId: string;
  body: string;
  customerId?: string | null;
  sentByUserId?: string | null;
  lineMessageId?: string | null;
  /** false の場合 failed_at を埋めて failure_reason を保持する */
  delivered?: boolean;
  failureReason?: string | null;
  /** line-media バケット内の添付保存パス (画像送信時) */
  attachmentPath?: string | null;
  attachmentContentType?: string | null;
}

/**
 * 顧客テーブルから line_user_id でマッチする顧客を 1 件返す。
 * inbound メッセージ受信時にスレッドを正しい customer に紐付けるために使う。
 */
async function resolveCustomerIdByLineUser(tenantId: string, lineUserId: string): Promise<string | null> {
  const { admin } = createTenantScopedAdmin(tenantId);
  try {
    const { data } = await admin
      .from("customers")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("line_user_id", lineUserId)
      .limit(1)
      .maybeSingle();
    return (data?.id as string | undefined) ?? null;
  } catch (e) {
    logger.warn("[messageStore] resolveCustomerIdByLineUser failed", {
      tenantId,
      err: e instanceof Error ? e.message : String(e),
    });
    return null;
  }
}

/**
 * LINE Webhook で受信した顧客発メッセージを customer_messages に書き込む。
 * customer は line_user_id でマッチを試み、見つからなければ NULL のまま保存。
 *
 * 失敗時は呼び出し元 (webhook) を止めない (LINE は 200 を即返す必要がある)。
 */
export async function recordInboundLineMessage(
  input: InboundLineMessage,
): Promise<{ ok: boolean; id?: string; customerId?: string | null }> {
  try {
    const customerId = await resolveCustomerIdByLineUser(input.tenantId, input.lineUserId);

    // RLS をバイパスして書き込むため service-role を使う (Webhook / 自動送信には
    // auth セッションが無いため tenant-scoped クライアントが使えない)。tenant_id
    // は webhook クエリパラメータ or 呼び出し元から厳密に渡される値を使うため、
    // 他テナントへの混入は customer_messages_select_v2 の RLS で防がれる。
    const admin = createServiceRoleAdmin(
      "LINE inbound/outbound message logging — webhook & admin push lack auth session",
    );
    const { data, error } = await admin
      .from("customer_messages")
      .insert({
        tenant_id: input.tenantId,
        customer_id: customerId,
        line_user_id: input.lineUserId,
        channel: "line",
        direction: "inbound",
        body: input.body,
        raw_event: input.rawEvent ?? null,
        line_message_id: input.lineMessageId ?? null,
        line_timestamp_ms: input.lineTimestampMs ?? null,
        attachment_path: input.attachmentPath ?? null,
        attachment_content_type: input.attachmentContentType ?? null,
      })
      .select("id")
      .single();
    if (error) {
      logger.warn("[messageStore] inbound insert failed", { tenantId: input.tenantId, err: error.message });
      return { ok: false, customerId };
    }
    return { ok: true, id: data?.id as string | undefined, customerId };
  } catch (e) {
    logger.warn("[messageStore] recordInboundLineMessage threw", {
      tenantId: input.tenantId,
      err: e instanceof Error ? e.message : String(e),
    });
    return { ok: false };
  }
}

export interface ConversationTurn {
  direction: "inbound" | "outbound";
  text: string;
  /** 受信日 (Asia/Tokyo, YYYY-MM-DD)。相対日付をターンごとに正しく解釈させる。 */
  date: string;
}

/** timestamptz → Asia/Tokyo の YYYY-MM-DD。相対日付("明日")の基準日として使う。 */
function toJstDate(createdAt: string | null | undefined): string {
  if (!createdAt) return "";
  const d = new Date(createdAt);
  if (Number.isNaN(d.getTime())) return "";
  // en-CA ロケールは ISO 風 (YYYY-MM-DD) で返す。
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Tokyo" });
}

/**
 * 複合認識 (会話文脈) 用に、同一スレッドの直近メッセージを古い順で返す。
 *
 * - スレッド特定は customer_id **と** line_user_id の両方でマッチ (OR)。リンク前に
 *   customer_id=NULL で溜まった同一 LINE ユーザーの過去メッセージも文脈に含める。
 *   メールは送信元 (email_from) を文脈キーにしない: 転送された予約サイト通知は共通の
 *   no-reply を送信元に持ち、別顧客の予約が履歴に混入して誤起票を招くため。
 * - `currentMessageId` の行を基準に、それと同時刻以降 (= 現在処理中メッセージ本体と、
 *   その受信後に送られた自動返信) は履歴から除外する。呼び出し元が「最新メッセージ」を
 *   別途 `text` として渡すため、履歴には**それより前**のやり取りだけを載せる。
 * - 配信失敗した outbound (failed_at) は顧客に届いていないため文脈から除く。
 *
 * fail-soft: 失敗時は空配列。
 */
export async function fetchRecentConversation(
  tenantId: string,
  key: { customerId?: string | null; lineUserId?: string | null },
  opts?: { limit?: number; currentMessageId?: string | null },
): Promise<ConversationTurn[]> {
  const limit = opts?.limit ?? 8;
  if (!key.customerId && !key.lineUserId) return [];
  try {
    const admin = createServiceRoleAdmin("AI 複合認識の会話文脈取得 — webhook には auth セッションが無い");
    // customer_id / line_user_id のいずれか一致でスレッドを束ねる (tenant_id は AND で担保)。
    // PostgREST の or 値はカンマ/括弧が区切りになるため、それらを含む値はマッチ対象から外す。
    const orParts: string[] = [];
    if (key.customerId) orParts.push(`customer_id.eq.${key.customerId}`);
    if (key.lineUserId && !/[(),]/.test(key.lineUserId)) orParts.push(`line_user_id.eq.${key.lineUserId}`);
    if (orParts.length === 0) return [];

    // 現在メッセージ本体・その後の返信・配信失敗行を差し引いても足りるよう多めに取得。
    const { data, error } = await admin
      .from("customer_messages")
      .select("id, direction, body, created_at, failed_at")
      .eq("tenant_id", tenantId)
      .or(orParts.join(","))
      .order("created_at", { ascending: false })
      .limit(limit + 12);
    if (error || !data) {
      if (error) logger.warn("[messageStore] fetchRecentConversation failed", { tenantId, err: error.message });
      return [];
    }

    // 現在処理中メッセージの受信時刻。これ以降 (返信含む) は「過去のやり取り」ではない。
    const current = opts?.currentMessageId ? data.find((r) => r.id === opts.currentMessageId) : null;
    const cutoff = current?.created_at ? new Date(current.created_at as string).getTime() : null;

    return data
      .filter((r) => {
        if (r.id === opts?.currentMessageId) return false;
        if (typeof r.body !== "string" || !r.body.trim()) return false;
        // 配信失敗した店舗発は届いていないので文脈にしない。
        if (r.direction === "outbound" && r.failed_at) return false;
        // 現在メッセージと同時刻以降 (= その後の自動返信など) を除外。
        if (cutoff != null && r.created_at) {
          if (new Date(r.created_at as string).getTime() >= cutoff) return false;
        }
        return true;
      })
      .slice(0, limit)
      .reverse() // 古い順に並べ替え
      .map((r) => ({
        direction: r.direction === "outbound" ? "outbound" : "inbound",
        text: r.body as string,
        date: toJstDate(r.created_at as string | null),
      }));
  } catch (e) {
    logger.warn("[messageStore] fetchRecentConversation threw", {
      tenantId,
      err: e instanceof Error ? e.message : String(e),
    });
    return [];
  }
}

export interface InboundEmailMessage {
  tenantId: string;
  /**
   * SMTP 送信元アドレス。**顧客同定には使わない** (転送された予約サイト通知の From は
   * no-reply 等で顧客本人とは限らないため)。スレッドキー兼メタデータとしてのみ保存する。
   */
  fromEmail: string | null;
  subject?: string | null;
  body: string;
  /** RFC822 Message-ID (冪等化・デバッグ用)。 */
  messageId?: string | null;
  /** デバッグ用に残す元メタ (headers 抜粋など)。 */
  rawMeta?: unknown;
}

/**
 * 受信メール (顧客発) を customer_messages に inbound / channel="email" で書き込む。
 *
 * customer_id は付けず (From を顧客同定に使わない方針)、送信元を email_from に保存する。
 * email_from は横断受信箱のスレッドキーになり、未紐付けメールもスタッフに見える。
 * 顧客への紐付けは後段の AI 抽出結果 (実在する顧客氏名/メール) に委ねる。
 * 失敗時は呼び出し元 (webhook) を止めない。
 */
export async function recordInboundEmailMessage(input: InboundEmailMessage): Promise<{ ok: boolean; id?: string }> {
  try {
    const admin = createServiceRoleAdmin("Inbound email logging — webhook lacks auth session");
    const { data, error } = await admin
      .from("customer_messages")
      .insert({
        tenant_id: input.tenantId,
        channel: "email",
        direction: "inbound",
        body: input.body,
        email_from: input.fromEmail,
        raw_event: {
          from: input.fromEmail,
          subject: input.subject ?? null,
          message_id: input.messageId ?? null,
          meta: input.rawMeta ?? null,
        },
      })
      .select("id")
      .single();
    if (error) {
      logger.warn("[messageStore] inbound email insert failed", { tenantId: input.tenantId, err: error.message });
      return { ok: false };
    }
    return { ok: true, id: data?.id as string | undefined };
  } catch (e) {
    logger.warn("[messageStore] recordInboundEmailMessage threw", {
      tenantId: input.tenantId,
      err: e instanceof Error ? e.message : String(e),
    });
    return { ok: false };
  }
}

/**
 * 店舗 → 顧客の Push 送信ログを customer_messages に書き込む。
 *
 * 配信成功時は `delivered=true` を、失敗時は `delivered=false` + `failureReason`
 * を渡す。どちらの場合もテーブルには行を残し、UI 上で「未配信」表示できるよう
 * にする (LINE の即時 push が失敗しても履歴は消さない方針)。
 */
/**
 * 受信箱に残す本文からマイページのログイントークンを伏せる。
 *
 * `/my/line?t=<64桁hex>` はそのままポータルに入れる資格情報なので、生のまま
 * `customer_messages` に残すと店舗スタッフが受信箱からコピーして顧客本人として
 * ログインできてしまう (トークンを DB に平文で持たない設計と矛盾する)。
 * 送信する本文はそのまま・記録する本文だけ伏せる。
 */
export function maskPortalLoginToken(body: string): string {
  return body.replace(/([?&]t=)[0-9a-f]{64}\b/gi, "$1***");
}

export async function recordOutboundLineMessage(input: OutboundLineMessage): Promise<{ ok: boolean; id?: string }> {
  try {
    const admin = createServiceRoleAdmin("LINE outbound message logging — admin push lacks tenant-scoped RLS context");
    const now = new Date().toISOString();
    const { data, error } = await admin
      .from("customer_messages")
      .insert({
        tenant_id: input.tenantId,
        customer_id: input.customerId ?? null,
        line_user_id: input.lineUserId,
        channel: "line",
        direction: "outbound",
        body: maskPortalLoginToken(input.body),
        sent_by: input.sentByUserId ?? null,
        line_message_id: input.lineMessageId ?? null,
        attachment_path: input.attachmentPath ?? null,
        attachment_content_type: input.attachmentContentType ?? null,
        delivered_at: input.delivered === false ? null : now,
        failed_at: input.delivered === false ? now : null,
        failure_reason: input.delivered === false ? (input.failureReason ?? null) : null,
      })
      .select("id")
      .single();
    if (error) {
      logger.warn("[messageStore] outbound insert failed", { tenantId: input.tenantId, err: error.message });
      return { ok: false };
    }
    return { ok: true, id: data?.id as string | undefined };
  } catch (e) {
    logger.warn("[messageStore] recordOutboundLineMessage threw", {
      tenantId: input.tenantId,
      err: e instanceof Error ? e.message : String(e),
    });
    return { ok: false };
  }
}
