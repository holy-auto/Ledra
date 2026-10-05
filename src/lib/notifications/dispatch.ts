/**
 * 中央通知 dispatch（IMP-029）。
 *
 * NOTIFICATION_TYPE_CATALOG の defaultChannels を resolveChannels() で解決し、
 * チャネルごとに既存の sender を呼ぶだけの薄いラッパ。宛先解決もここに集める。
 * 業務処理から fire-and-forget で呼ぶ前提で、**絶対に throw しない**。
 * 個々のチャネルの失敗は logger.warn のみ（呼び出し元の主処理は止めない）。
 *
 * 宛先（カタログの targetRole。2026-09-25 代表確定 = DECISION_LOG 同日）:
 *   - admin / owner: tenant_memberships の owner/admin/super_admin（bookingNotify 等と同じ条件）
 *   - assigned: 呼び出し側が userIds で渡す。空なら admin にフォールバック（insurer-sla-alerts と同方針）
 *   - customer: 呼び出し側が customerId で渡す（customers の email/phone/line_user_id）
 *   - 未指定（コンテキストで決定）: userIds があればその人、無ければテナント全員（in_app の user_id=NULL）
 *
 * チャネル:
 *   - in_app: notifications へ insert（スタッフ宛のみ。顧客のアプリ内受信箱は存在しないので customer 宛はスキップ）
 *   - email : sendEmail（Resend→SendGrid）
 *   - slack : tenants.booking_notify_slack_webhook_ciphertext（現状唯一のテナント単位 Slack Webhook）
 *   - line  : 顧客宛のみ（sendCustomerLineText）。tenants.line_enabled=false なら自動スキップ
 *   - sms   : 顧客宛のみ（sendNotificationSms）
 *   - push  : 未実装（スコープ外）
 *
 * ponytail: チャネル上書きはテナント単位の overrides 引数のみ（routing.ts の注記どおり、
 * ユーザー単位の設定は将来）。重複抑止（クールダウン）は呼び出し側のイベントが1回しか
 * 起きない前提で持たない。繰り返し起きるイベントを配線するときは呼び出し側で抑止すること。
 */
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/sendEmail";
import { notifySlack } from "@/lib/slack";
import { readSecret } from "@/lib/crypto/tenantSecrets";
import { sendCustomerLineText } from "@/lib/line/client";
import { isMissingRelationError } from "@/lib/line/inboundNotify";
import { sendNotificationSms } from "@/lib/sms/client";
import { logger, maskEmail } from "@/lib/logger";
import { escapeHtml } from "@/lib/sanitize";
import { getTypeConfig, type NotificationChannel, type NotificationType } from "./types";
import { resolveChannels, type ChannelOverrides } from "./routing";

export type DispatchParams = {
  tenantId: string;
  type: NotificationType;
  title: string;
  body: string;
  /** アプリ内の相対パス（/admin/orders/xxx 等）。メール/Slack では絶対 URL にして載せる。 */
  linkPath?: string | null;
  jobOrderId?: string | null;
  /** targetRole=assigned / 未指定のときの宛先スタッフ。 */
  userIds?: readonly string[];
  /** targetRole=customer のときの宛先顧客。 */
  customerId?: string | null;
  overrides?: ChannelOverrides;
};

export type Recipients = {
  /** in_app の user_id。null = テナント全員宛。空 = in_app の宛先なし。 */
  inAppUserIds: (string | null)[];
  emails: string[];
  phones: string[];
  lineUserIds: string[];
};

const ADMIN_ROLES = ["owner", "admin", "super_admin"];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

function absoluteUrl(linkPath: string | null | undefined): string | null {
  if (!linkPath) return null;
  return `${process.env.NEXT_PUBLIC_APP_URL ?? "https://app.ledra.co.jp"}${linkPath}`;
}

/**
 * 通知メール（件名=title、本文=body+リンク）を1通送る。insurer-sla-alerts のように
 * notifications テーブル以外の宛先を持つ経路からも同じ文面で送れるよう export する。
 */
export async function sendNotificationEmail(
  to: string,
  msg: { title: string; body: string; linkPath?: string | null },
): Promise<void> {
  const url = absoluteUrl(msg.linkPath);
  const res = await sendEmail({
    to,
    reply_to: "support@ledra.co.jp",
    subject: `【Ledra】${msg.title}`,
    html: `<div style="font-family: sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
<h2 style="font-size: 18px;">${escapeHtml(msg.title)}</h2>
<p style="line-height: 1.6; white-space: pre-wrap;">${escapeHtml(msg.body)}</p>
${url ? `<p><a href="${escapeHtml(url)}">Ledra で開く</a></p>` : ""}
<p style="font-size: 12px; color: #86868b;">Ledra — 株式会社HOLY</p></div>`,
    text: `${msg.title}\n\n${msg.body}\n${url ? `\n${url}\n` : ""}\n---\nLedra — 株式会社HOLY\n`,
  });
  if (!res.ok) throw new Error(`email send failed (${maskEmail(to)}): status ${res.status}`);
}

async function userEmails(admin: Admin, userIds: readonly string[]): Promise<string[]> {
  const results = await Promise.all(
    userIds.map(async (id) => {
      const { data } = await admin.auth.admin.getUserById(id);
      return (data?.user?.email as string | undefined) ?? null;
    }),
  );
  return results.filter((e): e is string => !!e);
}

async function adminUserIds(admin: Admin, tenantId: string): Promise<string[]> {
  const { data } = await admin
    .from("tenant_memberships")
    .select("user_id")
    .eq("tenant_id", tenantId)
    .in("role", ADMIN_ROLES);
  return [...new Set(((data ?? []) as { user_id: string }[]).map((m) => m.user_id))];
}

/** targetRole とチャネルから宛先を解決する。必要なチャネルの分だけ問い合わせる。 */
export async function resolveRecipients(
  admin: Admin,
  p: DispatchParams,
  channels: readonly NotificationChannel[],
): Promise<Recipients> {
  const role = getTypeConfig(p.type).targetRole;

  if (role === "customer") {
    if (!p.customerId) return { inAppUserIds: [], emails: [], phones: [], lineUserIds: [] };
    const { data: c } = await admin
      .from("customers")
      .select("email, phone, line_user_id")
      .eq("id", p.customerId)
      .eq("tenant_id", p.tenantId)
      .maybeSingle();
    return {
      inAppUserIds: [], // 顧客のアプリ内受信箱は無い
      emails: c?.email ? [c.email as string] : [],
      phones: c?.phone ? [c.phone as string] : [],
      lineUserIds: c?.line_user_id ? [c.line_user_id as string] : [],
    };
  }

  let userIds: string[];
  if (role === "admin" || role === "owner") {
    userIds = await adminUserIds(admin, p.tenantId);
  } else if (role === "assigned") {
    userIds = p.userIds?.length ? [...p.userIds] : await adminUserIds(admin, p.tenantId);
  } else {
    userIds = p.userIds ? [...p.userIds] : [];
  }

  return {
    // 宛先ロール未指定で userIds も無い = テナント全員宛（inboundNotify と同じ user_id=NULL）
    inAppUserIds: userIds.length ? userIds : role ? [] : [null],
    emails: channels.includes("email") ? await userEmails(admin, userIds) : [],
    phones: [], // スタッフの電話番号は保持していない
    lineUserIds: [], // スタッフの LINE ID は保持していない
  };
}

async function tenantLineEnabled(admin: Admin, tenantId: string): Promise<boolean> {
  const { data } = await admin.from("tenants").select("line_enabled").eq("id", tenantId).maybeSingle();
  return data?.line_enabled === true;
}

async function sendChannel(admin: Admin, ch: NotificationChannel, p: DispatchParams, to: Recipients): Promise<void> {
  switch (ch) {
    case "in_app": {
      if (to.inAppUserIds.length === 0) return;
      const { error } = await admin.from("notifications").insert(
        to.inAppUserIds.map((userId) => ({
          tenant_id: p.tenantId,
          user_id: userId,
          notification_type: p.type,
          priority: "normal", // priority は読み手が無い（OPEN_QUESTIONS 2026-08-31）。既存書き込みと揃える
          title: p.title,
          body: p.body,
          link_path: p.linkPath ?? null,
          job_order_id: p.jobOrderId ?? null,
        })),
      );
      if (error && !isMissingRelationError(error)) throw new Error(`notifications insert: ${error.message}`);
      return;
    }
    case "email":
      await Promise.all(to.emails.map((e) => sendNotificationEmail(e, p)));
      return;
    case "slack": {
      const { data } = await admin
        .from("tenants")
        .select("booking_notify_slack_webhook_ciphertext")
        .eq("id", p.tenantId)
        .maybeSingle();
      const ciphertext = data?.booking_notify_slack_webhook_ciphertext as string | null | undefined;
      if (!ciphertext) return; // 未設定はスキップ
      const webhookUrl = await readSecret(ciphertext, "tenants.booking_notify_slack_webhook_ciphertext");
      const url = absoluteUrl(p.linkPath);
      // 本文は顧客入力（懸念の本文等）を含みうるので、<!channel> 等のメンション注入を Slack の
      // 規定どおり & < > のエスケープで無効化する。
      const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      await notifySlack(webhookUrl ?? undefined, {
        text: esc(p.title),
        fields: [{ title: "内容", value: esc(p.body) }, ...(url ? [{ title: "リンク", value: url }] : [])],
      });
      return;
    }
    case "line": {
      const text = [p.title, p.body, absoluteUrl(p.linkPath)].filter(Boolean).join("\n");
      for (const lineUserId of to.lineUserIds) {
        const ok = await sendCustomerLineText({
          tenantId: p.tenantId,
          customerId: p.customerId,
          lineUserId,
          body: text,
        });
        if (!ok) throw new Error("line send failed");
      }
      return;
    }
    case "sms":
      for (const phone of to.phones) {
        const r = await sendNotificationSms(phone, `${p.title}\n${p.body}`);
        if (!r.ok) throw new Error(`sms send failed: ${r.error}`);
      }
      return;
    case "push":
      return; // 未実装（スコープ外）
  }
}

/** 通知を配信する。fire-and-forget 前提。絶対に throw しない。 */
export async function dispatchNotification(p: DispatchParams): Promise<void> {
  try {
    let channels = resolveChannels(p.type, p.overrides);
    if (channels.length === 0) return;
    const { admin } = createTenantScopedAdmin(p.tenantId);
    if (channels.includes("line") && !(await tenantLineEnabled(admin, p.tenantId))) {
      channels = channels.filter((c) => c !== "line");
    }
    const to = await resolveRecipients(admin, p, channels);
    const results = await Promise.allSettled(channels.map((ch) => sendChannel(admin, ch, p, to)));
    results.forEach((r, i) => {
      if (r.status === "rejected") {
        logger.warn("[notify] channel send failed", {
          tenantId: p.tenantId,
          type: p.type,
          channel: channels[i],
          err: r.reason instanceof Error ? r.reason.message : String(r.reason),
        });
      }
    });
  } catch (e) {
    logger.warn("[notify] dispatchNotification threw", {
      tenantId: p.tenantId,
      type: p.type,
      err: e instanceof Error ? e.message : String(e),
    });
  }
}
