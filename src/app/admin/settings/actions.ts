"use server";

import { revalidatePath } from "next/cache";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { calcLaborPrice } from "@/lib/pricing/labor";
import { buildSecretWrite } from "@/lib/crypto/tenantSecrets";
import { settingsSchema } from "./settingsSchema";

export type SettingsResult = { ok: true } | { ok: false; error: string };

export async function updateTenantSettingsAction(formData: FormData): Promise<SettingsResult> {
  const supabase = await createSupabaseServerClient();

  // テナント設定は owner のみ（代表判断 2026-09-04）。社名・住所・銀行口座・
  // Slack Webhook を扱うため、店舗の代表者だけが変更できる。
  //
  // ここまでロール判定が1つも無く、RLS 任せだった。RLS が弾いた場合 supabase-js の
  // .update() は「0行更新」で**エラーを返さない**ので、権限の無い人が保存すると
  // 何も変わらないのに { ok: true } が返っていた。
  //
  // tenantId は resolveCallerWithRole から取る。以前はローカルの getTenantId() が
  // `tenant_memberships` を `.limit(1).single()` で引いていたが、**並び順も
  // アクティブテナントの cookie も見ていなかった**。複数テナントに所属する人が
  // 店舗Aの画面で保存すると、店舗Bの行が書き換わりうる形だった。
  const caller = await resolveCallerWithRole(supabase);
  if (!caller) return { ok: false, error: "unauthorized" };
  if (!requireMinRole(caller, "owner")) {
    return { ok: false, error: "テナント設定を変更できるのは店舗オーナーのみです" };
  }
  const tenantId = caller.tenantId;

  // フォームで送られてきた項目のみ検証対象に含める (undefined は optional で素通し)。
  const get = (k: string) => (formData.has(k) ? String(formData.get(k) ?? "").trim() : undefined);
  const parsed = settingsSchema.safeParse({
    name: String(formData.get("name") ?? "").trim(),
    contact_email: get("contact_email"),
    contact_phone: get("contact_phone"),
    address: get("address"),
    website_url: get("website_url"),
    registration_number: get("registration_number"),
    bank_name: get("bank_name"),
    bank_branch_name: get("bank_branch_name"),
    bank_account_type: get("bank_account_type"),
    bank_account_number: get("bank_account_number"),
    bank_account_holder: get("bank_account_holder"),
    booking_notify_slack_webhook_url: get("booking_notify_slack_webhook_url"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "入力内容が正しくありません" };
  }
  const v = parsed.data;

  // Build update payload — include extended fields only if present in the form
  const payload: Record<string, unknown> = { name: v.name };
  // Only include extended fields if the form sent them (columnsExist path)
  if (formData.has("contact_email")) payload.contact_email = v.contact_email || null;
  if (formData.has("contact_phone")) payload.contact_phone = v.contact_phone || null;
  if (formData.has("address")) payload.address = v.address || null;
  if (formData.has("website_url")) payload.website_url = v.website_url || null;
  if (formData.has("registration_number")) payload.registration_number = v.registration_number || null;

  // レバーレート (工賃単価、円/時)。空欄 = 未設定 (null)
  let laborRate: number | null | undefined;
  if (formData.has("labor_rate_per_hour")) {
    const raw = String(formData.get("labor_rate_per_hour") ?? "").trim();
    if (raw === "") {
      laborRate = null;
    } else {
      const n = parseInt(raw, 10);
      if (!Number.isFinite(n) || n < 0) return { ok: false, error: "レバーレートは0以上の整数で入力してください" };
      laborRate = n > 0 ? n : null;
    }
    payload.labor_rate_per_hour = laborRate;
  }

  // Slack Webhook URLは秘密情報のためフォームには常に空欄で表示される（write-only）。
  // 空欄のまま保存 = 変更なし（既存値を保持）。明示的に削除したい場合のみチェックボックスでnull化する。
  // LINE channel secret / Square OAuth トークンと同じ規約で暗号化列に保存する。
  if (formData.get("booking_notify_slack_webhook_url_clear") === "on") {
    payload.booking_notify_slack_webhook_ciphertext = null;
  } else if (v.booking_notify_slack_webhook_url) {
    payload.booking_notify_slack_webhook_ciphertext = (
      await buildSecretWrite(v.booking_notify_slack_webhook_url)
    ).ciphertext;
  }

  if (formData.has("bank_name")) {
    payload.bank_info = {
      bank_name: v.bank_name || null,
      branch_name: v.bank_branch_name || null,
      account_type: v.bank_account_type || "普通",
      account_number: v.bank_account_number || null,
      account_holder: v.bank_account_holder || null,
    };
  }

  // .select() を付けて更新行数を見る。RLS で弾かれた場合 error は null のまま
  // 0行になるため、これが無いと「嘘の成功」を返す（PR #1014 で直したのと同じ型）。
  const { data: updated, error } = await supabase.from("tenants").update(payload).eq("id", tenantId).select("id");

  if (error) return { ok: false, error: error.message };
  if (!updated?.length) return { ok: false, error: "設定を更新できませんでした（権限がありません）" };

  // レバーレート設定時は、標準工数を持つ品目の提供価格を一括再計算する。
  // unit_price を単一の真実として維持することで、見積・クイック見積・AI 見積など
  // 下流は変更なしで新レートの工賃が反映される。
  if (typeof laborRate === "number" && laborRate > 0) {
    const { admin } = createTenantScopedAdmin(tenantId);
    const { data: laborItems } = await admin
      .from("menu_items")
      .select("id, labor_hours")
      .eq("tenant_id", tenantId)
      .gt("labor_hours", 0);
    if (laborItems && laborItems.length > 0) {
      // ponytail: 品目ごとに1クエリ (品目マスタは高々数百件)。数千件超で遅くなったら
      // SQL 関数 (unit_price = round(labor_hours * rate)) の一括 UPDATE に置き換える。
      await Promise.all(
        laborItems.map((it) => {
          const price = calcLaborPrice(it.labor_hours as number | null, laborRate as number);
          if (price == null) return Promise.resolve(null);
          return admin.from("menu_items").update({ unit_price: price }).eq("id", it.id).eq("tenant_id", tenantId);
        }),
      );
    }
  }

  revalidatePath("/admin/settings");
  revalidatePath("/admin");
  return { ok: true };
}
