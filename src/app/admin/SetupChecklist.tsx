import Link from "next/link";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import SampleDataActions from "./SampleDataActions";

type ChecklistItem = {
  id: string;
  label: string;
  description: string;
  href: string;
  cta: string;
  done: boolean;
  optional?: boolean;
};

type TenantRow = {
  name: string | null;
  logo_asset_path: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  address: string | null;
};

async function fetchTenantInfo(tenantId: string): Promise<TenantRow> {
  const { admin } = createTenantScopedAdmin(tenantId);
  const empty: TenantRow = {
    name: null,
    logo_asset_path: null,
    contact_email: null,
    contact_phone: null,
    address: null,
  };

  // logo_asset_path is always present; extended columns may not exist in older DBs
  try {
    const { data } = await admin
      .from("tenants")
      .select("name,logo_asset_path,contact_email,contact_phone,address")
      .eq("id", tenantId)
      .maybeSingle();
    if (!data) return empty;
    return {
      name: (data as TenantRow).name ?? null,
      logo_asset_path: (data as TenantRow).logo_asset_path ?? null,
      contact_email: (data as TenantRow).contact_email ?? null,
      contact_phone: (data as TenantRow).contact_phone ?? null,
      address: (data as TenantRow).address ?? null,
    };
  } catch {
    // Extended columns missing — fall back to name + logo only
    try {
      const { data } = await admin.from("tenants").select("name,logo_asset_path").eq("id", tenantId).maybeSingle();
      return {
        ...empty,
        name: (data as { name?: string | null } | null)?.name ?? null,
        logo_asset_path: (data as { logo_asset_path?: string | null } | null)?.logo_asset_path ?? null,
      };
    } catch (e) {
      logger.warn("SetupChecklist: tenant fetch failed", { err: e instanceof Error ? e.message : String(e) });
      return empty;
    }
  }
}

async function countRows(tenantId: string, table: string, tenantColumn = "tenant_id"): Promise<number> {
  const { admin } = createTenantScopedAdmin(tenantId);
  try {
    const { count } = await admin.from(table).select("*", { count: "exact", head: true }).eq(tenantColumn, tenantId);
    return count ?? 0;
  } catch (e) {
    logger.warn(`SetupChecklist: count ${table} failed`, { err: e instanceof Error ? e.message : String(e) });
    return 0;
  }
}

async function hasCustomizedFeatures(tenantId: string, userId: string): Promise<boolean> {
  const { admin } = createTenantScopedAdmin(tenantId);
  try {
    const { data } = await admin
      .from("user_feature_prefs")
      .select("visible_features")
      .eq("tenant_id", tenantId)
      .eq("user_id", userId)
      .maybeSingle();
    return Array.isArray(data?.visible_features) && data.visible_features.length > 0;
  } catch (e) {
    logger.warn("SetupChecklist: feature prefs check failed", { err: e instanceof Error ? e.message : String(e) });
    return false;
  }
}

export function SetupChecklistSkeleton() {
  return (
    <div className="glass-card p-5 animate-pulse">
      <div className="h-4 w-40 rounded bg-surface-hover mb-4" />
      <div className="h-2 w-full rounded bg-surface-hover mb-5" />
      <div className="space-y-3">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="h-12 rounded-lg bg-surface-hover" />
        ))}
      </div>
    </div>
  );
}

export default async function SetupChecklist({ tenantId, userId }: { tenantId: string; userId?: string }) {
  const [tenant, vehicleCount, certCount, customerCount, memberCount, hasCustomizedFeats] = await Promise.all([
    fetchTenantInfo(tenantId),
    countRows(tenantId, "vehicles"),
    countRows(tenantId, "certificates"),
    countRows(tenantId, "customers"),
    countRows(tenantId, "tenant_memberships"),
    userId ? hasCustomizedFeatures(tenantId, userId) : Promise.resolve(false),
  ]);

  const hasShopInfo = !!(tenant.contact_email || tenant.contact_phone || tenant.address);
  const hasLogo = !!tenant.logo_asset_path;
  const hasCustomerOrVehicle = customerCount > 0 || vehicleCount > 0;
  const hasCert = certCount > 0;
  const hasInvitedMember = memberCount > 1;

  const items: ChecklistItem[] = [
    {
      id: "shop_info",
      label: "店舗情報を入力",
      description: "住所・電話番号・連絡先メールを登録すると、証明書PDFや請求書に反映されます。",
      href: "/admin/settings",
      cta: "店舗設定を開く",
      done: hasShopInfo,
    },
    {
      id: "logo",
      label: "店舗ロゴをアップロード",
      description: "証明書・PDFの右上に表示される店舗ロゴを設定します。",
      href: "/admin/logo",
      cta: "ロゴをアップロード",
      done: hasLogo,
    },
    {
      id: "customer_or_vehicle",
      label: "最初の顧客または車両を登録",
      description: "証明書を発行するには、まず顧客もしくは車両を登録します。",
      href: customerCount === 0 ? "/admin/customers" : "/admin/vehicles/new",
      cta: customerCount === 0 ? "顧客を登録" : "車両を登録",
      done: hasCustomerOrVehicle,
    },
    {
      id: "certificate",
      label: "最初の証明書を発行",
      description: "施工内容・写真を入力するとQRコード付きのデジタル証明書が生成されます。",
      href: "/admin/certificates/new",
      cta: "証明書を発行",
      done: hasCert,
    },
    {
      id: "member",
      label: "スタッフを招待",
      description: "他のスタッフを招待してチームで運用できます。",
      href: "/admin/members",
      cta: "メンバー管理を開く",
      done: hasInvitedMember,
      optional: true,
    },
    {
      id: "customize_features",
      label: "使う機能だけ選んで、サイドバーをすっきりさせる",
      description: "「機能をカスタマイズ」から普段使わない機能を非表示にできます。あとからいつでも変更できます。",
      href: "/admin/settings/features",
      cta: "機能をカスタマイズ",
      done: hasCustomizedFeats,
      optional: true,
    },
  ];

  const requiredItems = items.filter((i) => !i.optional);
  const requiredDone = requiredItems.filter((i) => i.done).length;
  const requiredTotal = requiredItems.length;
  const totalDone = items.filter((i) => i.done).length;

  // 必須項目がすべて完了したら非表示にする
  if (requiredDone === requiredTotal) return null;

  const progressPct = Math.round((requiredDone / requiredTotal) * 100);
  const nextItem = items.find((i) => !i.done);

  return (
    <section data-tour="setup-checklist" className="glass-card p-5 border-l-4 border-accent">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
        <div className="min-w-0">
          <div className="text-xs font-semibold tracking-[0.18em] text-accent">セットアップ</div>
          <div className="mt-1 text-base font-semibold text-primary">
            {tenant.name ? `${tenant.name} へようこそ！使い始めの準備` : "使い始めの準備"}
          </div>
          <p className="mt-1 text-xs text-muted">
            下のステップを順に進めるだけで証明書発行まで完了できます。完了するとこのカードは自動的に非表示になります。
          </p>
        </div>
        <div className="text-right shrink-0">
          <div className="text-2xl font-bold text-primary">
            {requiredDone}
            <span className="text-base font-normal text-muted"> / {requiredTotal}</span>
          </div>
          <div className="text-[11px] text-muted">必須ステップ</div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-2 rounded-full bg-surface-active overflow-hidden mb-5">
        <div
          className="h-full rounded-full bg-gradient-to-r from-accent to-violet-500 transition-all duration-500"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      <ol className="space-y-2">
        {items.map((item) => {
          const isNext = !item.done && item === nextItem;
          return (
            <li
              key={item.id}
              className={`flex items-start gap-3 rounded-lg border p-3 transition-colors ${
                item.done
                  ? "border-success/20 bg-success-dim/40"
                  : isNext
                    ? "border-accent/40 bg-accent-dim/40"
                    : "border-border-default bg-surface-hover/30"
              }`}
            >
              <span
                aria-hidden
                className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                  item.done ? "bg-success text-white" : isNext ? "bg-accent text-white" : "bg-surface-active text-muted"
                }`}
              >
                {item.done ? "✓" : ""}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-sm font-medium ${item.done ? "text-muted line-through" : "text-primary"}`}>
                    {item.label}
                  </span>
                  {item.optional && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-active text-muted">任意</span>
                  )}
                </div>
                {!item.done && <p className="mt-1 text-xs text-muted leading-relaxed">{item.description}</p>}
              </div>
              {!item.done && (
                <Link
                  href={item.href}
                  className={`shrink-0 text-xs px-3 py-1.5 rounded-md font-medium transition-colors ${
                    isNext ? "btn-primary" : "btn-secondary"
                  }`}
                >
                  {item.cta}
                </Link>
              )}
            </li>
          );
        })}
      </ol>

      <SampleDataActions />

      <div className="mt-4 pt-4 border-t border-border-subtle flex items-center justify-between gap-3 flex-wrap">
        <p className="text-xs text-muted">
          全 {items.length} ステップ中 <span className="font-semibold text-primary">{totalDone}</span> 完了
        </p>
        <Link href="/admin/support" className="text-xs text-accent hover:underline">
          困ったときはサポートへ →
        </Link>
      </div>
    </section>
  );
}
