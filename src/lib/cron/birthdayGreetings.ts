/**
 * 誕生日メッセージ処理。
 *
 * `customers.birth_date` の月日が「今日 + birthday_lead_days」の月日に
 * 一致する顧客へ、お祝いメッセージを送る。
 *
 * - follow_up_settings.birthday_enabled が ON のテナントのみ対象
 * - LINE が繋がっていれば LINE 優先、無ければ email
 * - followup_opt_out の顧客は除外
 * - 重複送信防止: notification_logs.type = 'birthday_<year>' で
 *   顧客 1 人につき 1 年 1 回だけ送る
 *
 * 2/29 生まれは、閏年でない年は 2/28 に送る（その年に 2/29 が存在しないため）。
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { sendBirthdayEmail } from "@/lib/follow-up/email";
import { sendBirthdayLineMessage } from "@/lib/line/client";

export type BirthdaySetting = {
  tenant_id: string;
  birthday_enabled: boolean | null;
  birthday_lead_days: number | null;
};

type CustomerRow = {
  id: string;
  name: string | null;
  email: string | null;
  line_user_id: string | null;
  birth_date: string | null;
  followup_opt_out: boolean | null;
};

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/**
 * 「今日 + leadDays」の月日 (MM-DD) を返す。
 *
 * 2/28 かつ閏年でない年は、2/29 生まれも当日扱いにするため "02-29" も含める。
 * UTC ベースで計算する（cron の `new Date()` と DB の date 文字列を
 * toISOString スライスで突き合わせる既存フローと整合させる）。
 */
export function birthdayMatchKeys(today: Date, leadDays: number): string[] {
  const lead = Number.isFinite(leadDays) ? Math.max(0, Math.min(60, Math.trunc(leadDays))) : 0;
  const target = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  target.setUTCDate(target.getUTCDate() + lead);
  const mmdd = target.toISOString().slice(5, 10); // "MM-DD"
  const keys = [mmdd];
  if (mmdd === "02-28" && !isLeapYear(target.getUTCFullYear())) keys.push("02-29");
  return keys;
}

/**
 * 'YYYY-MM-DD' 形式の生年月日から月日キー (MM-DD) を取り出す。
 * パースできなければ null。
 */
export function birthDateKey(birthDate: string | null | undefined): string | null {
  if (!birthDate) return null;
  const m = birthDate.match(/^\d{4}-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}` : null;
}

/** 送信年（冪等キー用）。今日 + leadDays の年を使う。 */
export function birthdayNotifYear(today: Date, leadDays: number): number {
  const lead = Number.isFinite(leadDays) ? Math.max(0, Math.min(60, Math.trunc(leadDays))) : 0;
  const target = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  target.setUTCDate(target.getUTCDate() + lead);
  return target.getUTCFullYear();
}

function buildBirthdayLineMessage(shopName: string, customerName: string): string {
  return [
    `【${shopName}】${customerName} 様`,
    ``,
    `お誕生日おめでとうございます🎉`,
    `日頃のご愛顧に心より感謝申し上げます。`,
    `素敵な一年になりますよう、スタッフ一同お祈りしております。`,
    ``,
    `メンテナンスやお車のご相談はお気軽にどうぞ。`,
  ].join("\n");
}

/**
 * 誕生日メッセージを処理する。
 *
 * @returns 送信成功件数
 */
export async function processBirthdayGreetings(
  supabase: SupabaseClient,
  setting: BirthdaySetting,
  shopName: string,
  today: Date,
): Promise<number> {
  if (!setting.birthday_enabled) return 0;

  const leadDays = setting.birthday_lead_days ?? 0;
  const matchKeys = new Set(birthdayMatchKeys(today, leadDays));
  const notifType = `birthday_${birthdayNotifYear(today, leadDays)}`;

  // birth_date を持つ顧客を取得し、月日一致を JS 側で判定する。
  // (月日マッチは式インデックスが張れないため、tenant 絞り込み + アプリ判定が素直)
  const { data: rawCustomers } = await supabase
    .from("customers")
    .select("id, name, email, line_user_id, birth_date, followup_opt_out")
    .eq("tenant_id", setting.tenant_id)
    .not("birth_date", "is", null);

  const customers = (rawCustomers ?? []) as CustomerRow[];
  const targets = customers.filter((c) => {
    if (c.followup_opt_out) return false;
    if (!c.line_user_id && !c.email) return false;
    const key = birthDateKey(c.birth_date);
    return key !== null && matchKeys.has(key);
  });
  if (targets.length === 0) return 0;

  // 冪等性: 同じ送信年に送った顧客を弾く
  const targetIds = targets.map((c) => c.id);
  const { data: existingLogs } = await supabase
    .from("notification_logs")
    .select("target_id")
    .eq("tenant_id", setting.tenant_id)
    .eq("type", notifType)
    .in("target_id", targetIds);
  const alreadySent = new Set((existingLogs ?? []).map((l) => l.target_id));

  let sent = 0;
  for (const customer of targets) {
    if (alreadySent.has(customer.id)) continue;

    const customerName = customer.name ?? "お客様";
    let ok = false;
    let channel: "line" | "email" = "email";
    let recipientEmail: string | null = null;
    let recipientLineUserId: string | null = null;

    if (customer.line_user_id) {
      const lineOk = await sendBirthdayLineMessage({
        tenantId: setting.tenant_id,
        lineUserId: customer.line_user_id,
        message: buildBirthdayLineMessage(shopName, customerName),
      });
      if (lineOk) {
        ok = true;
        channel = "line";
        recipientLineUserId = customer.line_user_id;
      }
    }

    if (!ok && customer.email) {
      ok = await sendBirthdayEmail({ shopName, customerEmail: customer.email, customerName });
      channel = "email";
      recipientEmail = customer.email;
    }

    await supabase.from("notification_logs").insert({
      tenant_id: setting.tenant_id,
      type: notifType,
      target_type: "customer",
      target_id: customer.id,
      recipient_email: recipientEmail,
      recipient_line_user_id: recipientLineUserId,
      channel,
      status: ok ? "sent" : "failed",
    });

    if (ok) sent++;
  }

  return sent;
}
