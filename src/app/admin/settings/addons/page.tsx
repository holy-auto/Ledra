import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { ADDON_CATALOG, listEnabledAddons } from "@/lib/billing/addons";
import PageHeader from "@/components/ui/PageHeader";
import Badge from "@/components/ui/Badge";

export const dynamic = "force-dynamic";

export default async function TenantAddonsPage() {
  const supabase = await createSupabaseServerClient();
  const caller = await resolveCallerWithRole(supabase);
  if (!caller) redirect("/login?next=/admin/settings/addons");

  const { admin, tenantId } = createTenantScopedAdmin(caller.tenantId);
  const enabled = await listEnabledAddons(admin, tenantId);

  const addons = ADDON_CATALOG.map((entry) => ({ ...entry, enabled: enabled.has(entry.key) }));

  return (
    <div className="space-y-6">
      <PageHeader
        tag="アドオン"
        title="ご契約アドオン"
        description="標準プランに含まれない追加機能の利用状況です。"
        actions={
          <Link href="/admin/settings" className="btn-secondary">
            店舗設定へ戻る
          </Link>
        }
      />

      <section className="glass-card p-5">
        <div className="text-xs font-semibold tracking-[0.18em] text-muted">概要</div>
        <div className="mt-1 text-base font-semibold text-primary">アドオンとは</div>
        <p className="mt-2 text-sm text-secondary">
          Ledra
          の一部の機能（中古車マーケット・B2B案件・商談管理）は、業態によって必要・不要が分かれるため、標準プランに含まずアドオンとして
          opt-in でご提供しています。有効化のお申し込み・解約は Ledra
          運営窓口までご連絡ください。料金は別途ご案内します。
        </p>
      </section>

      <section className="space-y-3">
        {addons.map((a) => (
          <div key={a.key} className="glass-card p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <div className="text-base font-semibold text-primary">{a.label}</div>
                  <Badge variant={a.enabled ? "success" : "default"}>{a.enabled ? "ご契約中" : "未契約"}</Badge>
                </div>
                <p className="mt-2 text-sm text-secondary">{a.description}</p>
              </div>

              <div className="shrink-0 flex flex-col items-end gap-2">
                {a.enabled ? (
                  <Link href={a.primaryRoute} className="btn-primary text-xs px-3 py-1.5">
                    機能を開く
                  </Link>
                ) : (
                  <span className="text-xs text-muted">運営にお問い合わせください</span>
                )}
              </div>
            </div>
          </div>
        ))}
      </section>

      <section className="glass-card p-5">
        <div className="text-xs font-semibold tracking-[0.18em] text-muted">お申し込み・解約</div>
        <div className="mt-1 text-base font-semibold text-primary">サポート窓口</div>
        <p className="mt-2 text-sm text-secondary">
          アドオンの有効化・解約をご希望の場合は、サポートチャットまたは担当営業までご連絡ください。
          営業日中の対応となります。
        </p>
      </section>
    </div>
  );
}
