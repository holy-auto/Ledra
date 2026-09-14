import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import SettingsForm from "./SettingsForm";
import LogoSealSection from "./LogoSealSection";
import SettingsProgressCard from "./SettingsProgressCard";
import SettingsHub from "./SettingsHub";
import FollowUpSettings from "./FollowUpSettings";
import RestartTourButton from "./RestartTourButton";
import BillingTimingSection from "./BillingTimingSection";
import PageHeader from "@/components/ui/PageHeader";
import HelpTooltip from "@/components/ui/HelpTooltip";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

type BankInfoShape = {
  bank_name?: string;
  branch_name?: string;
  account_type?: string;
  account_number?: string;
  account_holder?: string;
} | null;

type TenantExtended = {
  contact_email: string | null;
  contact_phone: string | null;
  address: string | null;
  website_url: string | null;
  registration_number: string | null;
  bank_info: BankInfoShape;
  stripe_connect_account_id: string | null;
  stripe_connect_onboarded: boolean;
  labor_rate_per_hour: number | null;
};

const EMPTY_TENANT_EXTENDED: TenantExtended = {
  contact_email: null,
  contact_phone: null,
  address: null,
  website_url: null,
  registration_number: null,
  bank_info: null,
  stripe_connect_account_id: null,
  stripe_connect_onboarded: false,
  labor_rate_per_hour: null,
};

/** Attempt to fetch extended tenant columns added via migration.
 *  Returns null values gracefully if columns don't exist yet. */
async function fetchTenantExtended(tenantId: string): Promise<TenantExtended> {
  const { admin } = createTenantScopedAdmin(tenantId);
  try {
    const { data, error } = await admin
      .from("tenants")
      .select(
        "contact_email,contact_phone,address,website_url,registration_number,bank_info,stripe_connect_account_id,stripe_connect_onboarded,labor_rate_per_hour",
      )
      .eq("id", tenantId)
      .single();
    if (error || !data) return { ...EMPTY_TENANT_EXTENDED };
    const row = data as Partial<TenantExtended>;
    return {
      contact_email: row.contact_email ?? null,
      contact_phone: row.contact_phone ?? null,
      address: row.address ?? null,
      website_url: row.website_url ?? null,
      registration_number: row.registration_number ?? null,
      bank_info: row.bank_info ?? null,
      stripe_connect_account_id: row.stripe_connect_account_id ?? null,
      stripe_connect_onboarded: row.stripe_connect_onboarded ?? false,
      labor_rate_per_hour: row.labor_rate_per_hour ?? null,
    };
  } catch {
    return { ...EMPTY_TENANT_EXTENDED };
  }
}

/**
 * 予約通知Slack Webhookの存在確認/設定状況のみを取得する。
 *
 * `fetchTenantExtended` とは意図的に別クエリにしている: 同じ select に混ぜると、
 * このカラムのマイグレーション未適用時に select 全体がエラーになり、
 * contact_email 等の既存項目まで「未設定」に見えてしまう
 * （保存時に空文字で上書きされ既存値を消してしまう恐れがある）。
 *
 * また、Slack Webhook URL自体は値を返さない（設定済みかどうかの真偽値のみ）。
 * `tenants` は tenant_select_own RLS で同テナントの全メンバーが SELECT 可能なため、
 * オーナー以外のスタッフのブラウザにも生の値をレンダリングしない write-only 設計とする。
 */
async function fetchBookingNotifySlackStatus(
  tenantId: string,
): Promise<{ columnExists: boolean; configured: boolean }> {
  const { admin } = createTenantScopedAdmin(tenantId);
  const { data, error } = await admin
    .from("tenants")
    .select("booking_notify_slack_webhook_ciphertext")
    .eq("id", tenantId)
    .maybeSingle();
  const columnExists = !error || !error.message.includes("does not exist");
  const configured =
    columnExists &&
    !!(data as { booking_notify_slack_webhook_ciphertext?: string | null } | null)
      ?.booking_notify_slack_webhook_ciphertext;
  return { columnExists, configured };
}

export default async function AdminSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; e?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/admin/settings");

  const { data: membership } = await supabase
    .from("tenant_memberships")
    .select("tenant_id")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (!membership?.tenant_id) {
    return <div className="text-sm text-muted">tenant が見つかりません。</div>;
  }
  const tenantId = membership.tenant_id as string;

  const { data: tenant, error } = await supabase
    .from("tenants")
    .select("id,name,plan_tier,logo_asset_path,created_at")
    .eq("id", tenantId)
    .single();

  if (error || !tenant) {
    return <div className="text-sm text-red-500">テナント情報の取得に失敗しました。</div>;
  }

  const name = (tenant.name as string | null) ?? "";
  const planTier = (tenant.plan_tier as string | null) ?? "—";
  const hasLogo = !!(tenant.logo_asset_path as string | null);
  const createdAt = tenant.created_at as string | null;

  // Extended fields — gracefully null if migration not yet applied
  const ext = await fetchTenantExtended(tenantId);
  const bookingNotifySlack = await fetchBookingNotifySlackStatus(tenantId);
  const hasExtendedCols =
    ext.contact_email !== null ||
    ext.contact_phone !== null ||
    ext.address !== null ||
    ext.website_url !== null ||
    Object.keys(ext).length > 0; // always true, indicates columns exist

  // Actually detect if columns exist by checking error on a small query
  const { admin } = createTenantScopedAdmin(tenantId);
  const { error: detectErr } = await admin.from("tenants").select("contact_email").eq("id", tenantId).limit(1).single();
  const columnsExist = !detectErr || !detectErr.message.includes("does not exist");

  const hasContact = columnsExist && !!(ext.contact_email || ext.contact_phone);
  const hasAddress = columnsExist && !!ext.address;
  const hasInvoiceNumber = columnsExist && !!ext.registration_number;
  const hasBankInfo = columnsExist && !!(ext.bank_info?.bank_name && ext.bank_info?.account_number);
  const hasStripeConnect = columnsExist && !!ext.stripe_connect_onboarded;

  return (
    <div className="space-y-6">
      <PageHeader
        tag="店舗設定"
        title="店舗設定"
        description="店舗情報の編集・プラン確認を行います。"
        actions={
          <Link href="/admin" className="btn-secondary">
            ダッシュボード
          </Link>
        }
      />

      {/* 設定・マスタのハブ（サイドバーから外した設定系をここに集約）。
          必須未入力 (店舗名・連絡先) があれば冒頭に要対応の導線を出す。 */}
      <SettingsHub
        requiredMissing={[!name ? "店舗名" : null, !hasContact ? "連絡先" : null].filter(
          (v): v is string => v !== null,
        )}
      />

      <div id="settings-progress" className="scroll-mt-20">
        <SettingsProgressCard
          hasShopName={!!name}
          hasContact={hasContact}
          hasAddress={hasAddress}
          hasLogo={hasLogo}
          hasInvoiceNumber={hasInvoiceNumber}
          hasBankInfo={hasBankInfo}
          hasStripeConnect={hasStripeConnect}
        />
      </div>

      {/* Plan info */}
      <section className="glass-card p-5">
        <div className="mb-4">
          <div className="text-xs font-semibold tracking-[0.18em] text-muted">プラン</div>
          <div className="mt-1 text-base font-semibold text-primary">プラン情報</div>
        </div>
        <div className="grid gap-4 sm:grid-cols-3 text-sm">
          <div className="glass-card p-4">
            <div className="text-xs text-muted">現在のプラン</div>
            <div className="mt-1 font-semibold text-primary uppercase">{planTier}</div>
          </div>
          <div className="glass-card p-4">
            <div className="text-xs text-muted">ロゴ設定</div>
            <div className={`mt-1 font-semibold ${hasLogo ? "text-success" : "text-warning"}`}>
              {hasLogo ? "設定済み" : "未設定"}
            </div>
          </div>
          <div className="glass-card p-4">
            <div className="text-xs text-muted">テナントID</div>
            <div className="mt-1 font-mono text-[11px] text-muted break-all">{tenantId.slice(0, 16)}…</div>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link href="/admin/billing" className="btn-secondary">
            プラン・請求管理
          </Link>
          <Link href="/admin/settings/addons" className="btn-secondary">
            ご契約アドオン
          </Link>
        </div>
      </section>

      {/* Migration notice if columns missing */}
      {!columnsExist && (
        <section className="glass-card glow-amber p-5">
          <div className="mb-3">
            <div className="text-xs font-semibold tracking-[0.18em] text-warning">マイグレーション必要</div>
            <div className="mt-1 text-base font-semibold text-primary">住所・連絡先項目を有効にするには</div>
          </div>
          <p className="text-sm text-secondary mb-3">Supabase SQL Editor で以下を実行してください：</p>
          <pre className="rounded-xl bg-surface px-4 py-3 text-xs text-secondary overflow-x-auto whitespace-pre-wrap">{`ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS contact_email text,
  ADD COLUMN IF NOT EXISTS contact_phone text,
  ADD COLUMN IF NOT EXISTS address       text,
  ADD COLUMN IF NOT EXISTS website_url   text;`}</pre>
          <p className="mt-2 text-xs text-muted">
            SQL Editor:{" "}
            <a
              href="https://supabase.com/dashboard/project/cahybswpduchptvyvdkk/sql/new"
              target="_blank"
              rel="noreferrer"
              className="underline text-accent"
            >
              supabase.com/dashboard/project/cahybswpduchptvyvdkk/sql/new
            </a>
          </p>
        </section>
      )}

      {/* Tenant info form */}
      <section className="glass-card p-5">
        <div className="mb-5">
          <div className="text-xs font-semibold tracking-[0.18em] text-muted">店舗情報</div>
          <div className="mt-1 text-base font-semibold text-primary">店舗情報</div>
        </div>

        <SettingsForm
          name={name}
          contactEmail={columnsExist ? ext.contact_email : null}
          contactPhone={columnsExist ? ext.contact_phone : null}
          address={columnsExist ? ext.address : null}
          websiteUrl={columnsExist ? ext.website_url : null}
          registrationNumber={columnsExist ? ext.registration_number : null}
          bankInfo={columnsExist ? ext.bank_info : null}
          laborRatePerHour={columnsExist ? ext.labor_rate_per_hour : null}
          bookingNotifySlackColumnExists={bookingNotifySlack.columnExists}
          bookingNotifySlackConfigured={bookingNotifySlack.configured}
          columnsExist={columnsExist}
          connectStatus={
            columnsExist
              ? {
                  accountId: ext.stripe_connect_account_id ?? null,
                  onboarded: ext.stripe_connect_onboarded ?? false,
                }
              : null
          }
        />
      </section>

      {/* ロゴ・角印 */}
      <LogoSealSection sp={sp} />

      {/* 請求タイミング */}
      <section className="glass-card p-5">
        <BillingTimingSection />
      </section>

      {/* 外部連携（Slack / Square / LINE / メール取り込み / NexPTG）は 1 枚のページに集約した。
          ここには入口だけを残す。 */}
      <section className="glass-card p-5">
        <div className="mb-4">
          <div className="text-xs font-semibold tracking-[0.18em] text-muted">外部連携</div>
          <div className="mt-1 text-base font-semibold text-primary">外部サービス連携</div>
          <p className="mt-1 text-xs text-muted">
            Slack・LINE・Square・Googleカレンダー・会計ソフトなどの連携状況を1画面でまとめて確認・設定できます。
          </p>
        </div>
        <Link href="/admin/settings/connections" className="btn-secondary">
          連携を設定する →
        </Link>
      </section>

      {/* Coating products master */}
      <section className="glass-card p-5">
        <div className="mb-4">
          <div className="text-xs font-semibold tracking-[0.18em] text-muted">マスター管理</div>
          <div className="mt-1 text-base font-semibold text-primary">コーティング剤マスター</div>
          <p className="mt-1 text-xs text-muted">ブランドと製品を登録し、証明書作成時に選択できるようにします。</p>
        </div>
        <Link href="/admin/settings/brands" className="btn-secondary">
          ブランド・製品を管理する →
        </Link>
      </section>

      {/* Follow-up settings */}
      <section className="glass-card p-5">
        <div className="mb-5">
          <div className="text-xs font-semibold tracking-[0.18em] text-muted">フォロー</div>
          <div className="mt-1 text-base font-semibold text-primary inline-flex items-center gap-1.5">
            顧客フォロー設定
            <HelpTooltip>
              施工後 6/12
              ヶ月でメンテナンスリマインダーを自動送信したり、証明書の有効期限が近づいた顧客に通知を送る機能です。リピート率と顧客満足度の向上に直結します。
            </HelpTooltip>
          </div>
          <p className="mt-1 text-xs text-muted">有効期限リマインダーや施工後フォローの自動送信を設定します。</p>
        </div>
        <FollowUpSettings />
      </section>

      {/* AI 自動入力 */}
      <section className="glass-card p-5">
        <div className="mb-4">
          <div className="text-xs font-semibold tracking-[0.18em] text-muted">AI AUTOMATION</div>
          <div className="mt-1 text-base font-semibold text-primary inline-flex items-center gap-1.5">
            AI 自動入力の設定
            <HelpTooltip>
              施工証明書・車両登録・顧客 intake・案件ワークフローの各フィールドを「AI 自動入力 / AI 提案 /
              手動」のどれにするか、テナント単位で設定します。情報ソース (写真 / ヒアリング / 過去事例 等)
              の参照可否も切替可能。
            </HelpTooltip>
          </div>
          <p className="mt-1 text-xs text-muted">
            ワークフロー全体の入力工数を AI で削減しつつ、フィールド単位で「人が見てから反映」「AI
            には触らせない」を細かく指定できます。
          </p>
        </div>
        <Link href="/admin/settings/ai-automation" className="btn-secondary">
          ✨ AI 自動入力の設定を開く →
        </Link>
      </section>

      {/* LINE ナレッジ (自動返信の学習) */}
      <section className="glass-card p-5">
        <div className="mb-4">
          <div className="text-xs font-semibold tracking-[0.18em] text-muted">LINE KNOWLEDGE</div>
          <div className="mt-1 text-base font-semibold text-primary inline-flex items-center gap-1.5">
            LINEナレッジ (自動返信の学習)
            <HelpTooltip>
              営業時間・駐車場・対応可否・支払い方法など、LINE 公式アカウントの AI
              自動返信に答えさせたい内容を登録します。AI は登録した内容だけを根拠に返信し、登録が無い質問は
              スタッフ対応に残します。自動返信の ON/OFF は AI 自動入力の設定で切り替えます。
            </HelpTooltip>
          </div>
          <p className="mt-1 text-xs text-muted">
            よくある質問と回答を登録して、LINE の AI 自動返信に「学習」させます。
          </p>
        </div>
        <Link href="/admin/settings/line-knowledge" className="btn-secondary">
          💬 LINEナレッジを開く →
        </Link>
      </section>

      {/* 施工ナレッジ (現場の勘所) */}
      <section className="glass-card p-5">
        <div className="mb-4">
          <div className="text-xs font-semibold tracking-[0.18em] text-muted">FIELD KNOWLEDGE</div>
          <div className="mt-1 text-base font-semibold text-primary inline-flex items-center gap-1.5">
            施工ナレッジ (現場の勘所)
            <HelpTooltip>
              車種別の注意点・配線ルート・クレーム事例など、ベテランの知見を登録しておくと、スタッフが AI
              に質問して引き出せます。AI は登録した内容だけを根拠に答え、記録に無い内容は「確認が必要」と返します。
            </HelpTooltip>
          </div>
          <p className="mt-1 text-xs text-muted">現場の勘所を資産化し、新人でも AI で引き出せるようにします。</p>
        </div>
        <Link href="/admin/field-knowledge" className="btn-secondary">
          🔧 施工ナレッジを開く →
        </Link>
      </section>

      {/* Security */}
      <section className="glass-card p-5">
        <div className="mb-4">
          <div className="text-xs font-semibold tracking-[0.18em] text-muted">セキュリティ</div>
          <div className="mt-1 text-base font-semibold text-primary">2 要素認証 (2FA)</div>
          <p className="mt-1 text-xs text-muted">
            認証アプリを使ったログイン時の本人確認を有効化し、アカウントを強化します。
          </p>
        </div>
        <Link href="/admin/settings/security" className="btn-secondary">
          🔐 セキュリティ設定を開く →
        </Link>
      </section>

      {/* Account info */}
      <section className="glass-card p-5">
        <div className="mb-4">
          <div className="text-xs font-semibold tracking-[0.18em] text-muted">アカウント</div>
          <div className="mt-1 text-base font-semibold text-primary">アカウント情報</div>
        </div>
        <div className="space-y-2 text-sm text-secondary">
          <div className="flex items-center gap-2">
            <span className="text-muted">ログイン中:</span>
            <span className="font-medium text-primary">{user.email ?? user.id}</span>
          </div>
          {createdAt && (
            <div className="flex items-center gap-2">
              <span className="text-muted">テナント作成日:</span>
              <span>{formatDate(createdAt)}</span>
            </div>
          )}
        </div>
        <div className="mt-4 flex gap-3">
          <Link href="/api/auth/signout" className="btn-secondary">
            ログアウト
          </Link>
          <RestartTourButton />
        </div>
      </section>
    </div>
  );
}
