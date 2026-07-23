import { z } from "zod";

// 空欄可の任意テキスト項目。空文字は許容し、長さ上限のみ課す。
const optionalText = (max: number, label: string) =>
  z.string().trim().max(max, `${label}は${max}文字以内で入力してください`).optional();

/**
 * テナント設定フォームの入力バリデーション。
 *
 * 列存在フェイルセーフ (columnsExist) のため、送られてこなかった項目は
 * undefined のまま素通しし、送られた項目のみ検証する。信頼境界での入力検証を
 * server action 本体 (Supabase 依存) から切り離し、単体テスト可能にする。
 */
export const settingsSchema = z.object({
  name: z.string().trim().min(1, "店舗名は必須です").max(120, "店舗名は120文字以内で入力してください"),
  contact_email: z
    .union([z.literal(""), z.string().trim().email("メールアドレスの形式が正しくありません").max(254)])
    .optional(),
  contact_phone: optionalText(40, "電話番号"),
  address: optionalText(300, "住所"),
  website_url: z
    .union([
      z.literal(""),
      z
        .string()
        .trim()
        .max(500)
        .url("URLの形式が正しくありません")
        // http/https 以外 (javascript:, data: 等) を弾く。website_url は後段で
        // リンク href として描画され得るため、スキーム制限は XSS 対策。
        .refine((v) => /^https?:\/\//i.test(v), "URLは http(s):// から始まる形式で入力してください"),
    ])
    .optional(),
  registration_number: optionalText(100, "登録番号"),
  bank_name: optionalText(120, "銀行名"),
  bank_branch_name: optionalText(120, "支店名"),
  bank_account_type: optionalText(20, "口座種別"),
  bank_account_number: optionalText(30, "口座番号"),
  bank_account_holder: optionalText(120, "口座名義"),
  // Slack Incoming Webhook 以外のホストを許すと、予約のたびに顧客名・日時・備考を
  // 任意のサーバーへPOSTする「保存型SSRF/データ流出シンク」になり得るため、
  // hooks.slack.com の /services/... 形式に限定する。
  booking_notify_slack_webhook_url: z
    .union([
      z.literal(""),
      z
        .string()
        .trim()
        .max(500)
        .refine((v) => {
          try {
            const u = new URL(v);
            return u.protocol === "https:" && u.hostname === "hooks.slack.com" && u.pathname.startsWith("/services/");
          } catch {
            return false;
          }
        }, "SlackのIncoming Webhook URL（https://hooks.slack.com/services/... 形式）で入力してください"),
    ])
    .optional(),
});

export type SettingsInput = z.infer<typeof settingsSchema>;
