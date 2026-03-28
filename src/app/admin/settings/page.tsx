import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createAdminClient as createSupabaseAdminClient } from "@/lib/supabase/admin";
import SettingsForm from "./SettingsForm";
import FollowUpSettings from "./FollowUpSettings";
import SquareConnectSection from "./SquareConnectSection";
import RestartTourButton from "./RestartTourButton";
import PageHeader from "@/components/ui/PageHeader";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

/** Attempt to fetch extended tenant columns added via migration.
 *  Returns null values gracefully if columns don't exist yet. */
async function fetchTenantExtended(tenantId: string) {
  // Try with extra columns first
  const admin = createSupabaseAdminClient();
  try {
    const { data, error } = await admin
      .from("tenants")
      .select("contact_email,contact_phone,address,website_url,registration_number,bank_info,stripe_connect_account_id,stripe_connect_onboarded")
      .eq("id", tenantId)
      .single();
    if (error) return { contact_email: null, contact_phone: null, address: null, website_url: null, registration_number: null, bank_info: null, stripe_connect_account_id: null, stripe_connect_onboarded: false };
    const row = data as {
      contact_email: string | null;
      contact_phone: string | null;
      address: string | null;
      website_url: string | null;
      registration_number: string | null;
      bank_info: string | null;
      stripe_connect_account_id: string | null;
      stripe_connect_onboarded: boolean | null;
    } | null;
    return {
      contact_email: row?.contact_email ?? null,
      contact_phone: row?.contact_phone ?? null,
      address: row?.address ?? null,
      website_url: row?.website_url ?? null,
      registration_number: row?.registration_number ?? null,
      bank_info: row?.bank_info ?? null,
      stripe_connect_account_id: row?.stripe_connect_account_id ?? null,
      stripe_connect_onboarded: row?.stripe_connect_onboarded ?? false,
    };
  } catch {
    return { contact_email: null, contact_phone: null, address: null, website_url: null, registration_number: null, bank_info: null };
  }
}

export default async function AdminSettingsPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
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
  const createdAt = (tenant.created_at as string | null);

  // Extended fields — gracefully null if migration not yet applied
  const ext = await fetchTenantExtended(tenantId);
  const hasExtendedCols = ext.contact_email !== null || ext.contact_phone !== null
    || ext.address !== null || ext.website_url !== null
    || Object.keys(ext).length > 0; // always true, indicates columns exist

  // Actually detect if columns exist by checking error on a small query
  const admin = createSupabaseAdminClient();
  const { error: detectErr } = await admin
    .from("tenants")
    .select("contact_email")
    .eq("id", tenantId)
    .limit(1)
    .single();
  const columnsExist = !detectErr || !detectErr.message.includes("does not exist");

  return (
    <div className="space-y-6">

        <PageHeader
          tag="店舗設定"
          title="店舗設定"
          description="店舗情報の編集・プラン確認を行います。"
          actions={
            <Link href="/admin" className="btn-secondary">ダッシュボード</Link>
          }
        />

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
              <div className={`mt-1 font-semibold ${hasLogo ? "text-emerald-400" : "text-amber-400"}`}>
                {hasLogo ? "設定済み" : "未設定"}
              </div>
            </div>
            <div className="glass-card p-4">
              <div className="text-xs text-muted">テナントID</div>
              <div className="mt-1 font-mono text-[11px] text-muted break-all">{tenantId.slice(0, 16)}…</div>
            </div>
          </div>
          <div className="mt-4 flex gap-3">
            <Link href="/admin/billing" className="btn-secondary">プラン・請求管理</Link>
            <Link href="/admin/logo" className="btn-secondary">ロゴを設定</Link>
          </div>
        </section>

        {/* Migration notice if columns missing */}
        {!columnsExist && (
          <section className="glass-card glow-amber p-5">
            <div className="mb-3">
              <div className="text-xs font-semibold tracking-[0.18em] text-amber-400">マイグレーション必要</div>
              <div className="mt-1 text-base font-semibold text-primary">住所・連絡先項目を有効にするには</div>
            </div>
            <p className="text-sm text-secondary mb-3">
              Supabase SQL Editor で以下を実行してください：
            </p>
            <pre className="rounded-xl bg-surface px-4 py-3 text-xs text-secondary overflow-x-auto whitespace-pre-wrap">{`ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS contact_email text,
  ADD COLUMN IF NOT EXISTS contact_phone text,
  ADD COLUMN IF NOT EXISTS address       text,
  ADD COLUMN IF NOT EXISTS website_url   text;`}</pre>
            <p className="mt-2 text-xs text-muted">
              SQL Editor: <a href="https://supabase.com/dashboard/project/cahybswpduchptvyvdkk/sql/new" target="_blank" rel="noreferrer" className="underline text-accent">supabase.com/dashboard/project/cahybswpduchptvyvdkk/sql/new</a>
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
            columnsExist={columnsExist}
            connectStatus={columnsExist ? {
              accountId: (ext as any).stripe_connect_account_id ?? null,
              onboarded: (ext as any).stripe_connect_onboarded ?? false,
            } : null}
          />
        </section>

        {/* Square連携 */}
        <section className="glass-card p-5">
          <div className="mb-5">
            <div className="text-xs font-semibold tracking-[0.18em] text-muted">外部連携</div>
            <div className="mt-1 text-base font-semibold text-primary">Square連携</div>
            <p className="mt-1 text-xs text-muted">SquareのPOS売上データをLedraに取り込みます。</p>
          </div>
          <SquareConnectSection />
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
            <div className="mt-1 text-base font-semibold text-primary">顧客フォロー設定</div>
            <p className="mt-1 text-xs text-muted">有効期限リマインダーや施工後フォローの自動送信を設定します。</p>
          </div>
          <FollowUpSettings />
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
            <Link href="/api/auth/signout" className="btn-secondary">ログアウト</Link>
            <RestartTourButton />
          </div>
        </section>

    </div>
  );
}
