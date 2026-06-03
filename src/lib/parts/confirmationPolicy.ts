/**
 * 確定署名の保証グレード／チャンネル決定ポリシー（T7/T7' 防止の中核）。
 *
 * 設計: docs/parts-installation-integrity-design.md §6.4.1 / §6.4.2 / §6.4.6
 *
 * 純関数。service が顧客の連絡先出所・チャンネル能力を集めて渡す。
 */

export type RequiredAssurance = "customer_otp" | "store_contact_otp" | "any";
export type Assurance = "customer_otp" | "store_contact_otp" | "in_store_tablet";
export type Channel = "line" | "sms" | "in_store_tablet";
export type ContactProvenance = "customer" | "store";

export interface ConfirmationContext {
  /** 装着レコードが要求する最低保証グレード（part_kind から導出済み）。 */
  requiredAssurance: RequiredAssurance;
  /** OTP/リンクの送り先連絡先の出所（顧客自身が登録 or 店が入力）。 */
  contactProvenance: ContactProvenance | null;
  /** 顧客が LINE 連携済みか。 */
  lineLinked: boolean;
  /** 送信可能な電話番号（フルハッシュ算出済み）があるか。 */
  phoneAvailable: boolean;
  /** 店頭タブレットでの対面署名を要求しているか（顧客不在・電話なし時）。 */
  inStoreTablet?: boolean;
}

export type ConfirmationDecision = { ok: true; assurance: Assurance; channel: Channel } | { ok: false; reason: string };

const rank: Record<RequiredAssurance | Assurance, number> = {
  any: 1,
  in_store_tablet: 1,
  store_contact_otp: 2,
  customer_otp: 3,
};

/**
 * 確定方式を決定する。
 * - LINE 優先 → SMS フォールバック（§6.4.2）。
 * - 連絡先出所が store の場合は customer_otp に達しない（§6.4.1：T7' 防止）。
 * - 店頭タブレットは consumable 相当（required='any'）のみ許可（§6.4.6）。
 */
export function resolveConfirmation(ctx: ConfirmationContext): ConfirmationDecision {
  const required = rank[ctx.requiredAssurance];

  // 店頭タブレット（顧客不在・電話なし）: required='any' のときだけ許可
  if (ctx.inStoreTablet) {
    if (required > rank.in_store_tablet) {
      return {
        ok: false,
        reason: "高リスク部品は店頭タブレットで確定できません（顧客本人の携帯OTPが必要）。",
      };
    }
    return { ok: true, assurance: "in_store_tablet", channel: "in_store_tablet" };
  }

  if (!ctx.phoneAvailable && !ctx.lineLinked) {
    return { ok: false, reason: "送信可能な連絡先（LINE/電話）がありません。" };
  }

  // 連絡先出所による達成可能グレード
  const achievable: Assurance = ctx.contactProvenance === "customer" ? "customer_otp" : "store_contact_otp";

  if (rank[achievable] < required) {
    return {
      ok: false,
      reason: "この部品は顧客本人が登録した連絡先での確定が必要です（店が入力した連絡先では確定できません）。",
    };
  }

  const channel: Channel = ctx.lineLinked ? "line" : "sms";
  return { ok: true, assurance: achievable, channel };
}
