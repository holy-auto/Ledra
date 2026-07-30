import { redirect } from "next/navigation";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole, requirePermission } from "@/lib/auth/checkRole";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import PageHeader from "@/components/ui/PageHeader";
import { formatDate, formatJpy } from "@/lib/format";

export const dynamic = "force-dynamic";

type ShareRow = {
  id: string;
  vin_code_normalized: string;
  cert_count: number;
  total_cert_count: number;
  amount: number;
  status: string;
  created_at: string;
};

const STATUS_LABEL: Record<string, string> = {
  pending: "計上済み",
  approved: "承認済み",
  paid: "支払済み",
  failed: "失敗",
  cancelled: "取消",
  reversed: "返金",
};

export default async function ReportRevenuePage() {
  const supabase = await createSupabaseServerClient();
  const caller = await resolveCallerWithRole(supabase);
  if (!caller) redirect("/login?next=/admin/report-revenue");
  if (!requirePermission(caller, "payments:view")) {
    return (
      <div className="space-y-6">
        <PageHeader title="レポート収益" />
        <p className="text-sm text-muted">この画面を表示する権限がありません。</p>
      </div>
    );
  }

  const { admin, tenantId } = createTenantScopedAdmin(caller.tenantId);
  const { data } = await admin
    .from("vehicle_report_revenue_shares")
    .select("id, vin_code_normalized, cert_count, total_cert_count, amount, status, created_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(200);

  const shares = (data ?? []) as ShareRow[];

  // Lifetime accrual = everything not cancelled/reversed. "Unpaid" = the
  // portion still awaiting settlement (pending/approved).
  const active = shares.filter((s) => s.status !== "cancelled" && s.status !== "reversed");
  const totalAccrued = active.reduce((sum, s) => sum + s.amount, 0);
  const unpaid = active
    .filter((s) => s.status === "pending" || s.status === "approved")
    .reduce((sum, s) => sum + s.amount, 0);

  // Payouts go to the tenant's Stripe Connect account — surface the setup
  // link when there's money waiting but no connected account yet.
  const { data: tenantRow } = await admin
    .from("tenants")
    .select("stripe_connect_onboarded")
    .eq("id", tenantId)
    .maybeSingle();
  const onboarded = !!(tenantRow as { stripe_connect_onboarded: boolean | null } | null)?.stripe_connect_onboarded;

  return (
    <div className="space-y-6">
      <PageHeader
        title="レポート収益"
        description="あなたの記録が生んだ収益 — 残した施工記録が、後年に第三者へ閲覧されるたびに収益として還元されます。"
      />

      {/* Value framing: 技術が、資産になる。 */}
      <div className="glass-card p-5">
        <div className="text-sm font-semibold text-primary">技術が、資産になる。</div>
        <p className="mt-1 text-sm leading-6 text-secondary">
          今日残した施工記録 1 件が、3 年後に買取店・査定・保険会社が車両全履歴レポートを閲覧するたびに収益を生みます。
          レポート売上のうち施工店還元分を、その車両に残した記録の件数に応じて按分しています。
        </p>
      </div>

      {/* Payout onboarding CTA — only when money is waiting and no Connect yet */}
      {unpaid > 0 && !onboarded ? (
        <div className="rounded-xl border border-amber-500/30 bg-[rgba(245,158,11,0.08)] p-4 text-sm">
          <div className="font-semibold text-amber-500">還元金の受け取りには振込先の登録が必要です</div>
          <p className="mt-1 text-secondary">
            未精算の還元金があります。{" "}
            <a href="/admin/settings" className="font-semibold text-blue-400 hover:underline">
              設定 &gt; お支払い（Stripe 連携）
            </a>{" "}
            から振込口座を登録すると、精算時にお支払いします。
          </p>
        </div>
      ) : null}

      {/* Summary tiles */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="glass-card p-5">
          <div className="text-xs text-muted">累計還元額</div>
          <div className="mt-1 text-2xl font-extrabold text-primary">{formatJpy(totalAccrued)}</div>
        </div>
        <div className="glass-card p-5">
          <div className="text-xs text-muted">未精算（支払待ち）</div>
          <div className="mt-1 text-2xl font-extrabold text-primary">{formatJpy(unpaid)}</div>
        </div>
        <div className="glass-card p-5">
          <div className="text-xs text-muted">還元が発生した回数</div>
          <div className="mt-1 text-2xl font-extrabold text-primary">{active.length}</div>
        </div>
      </div>

      {/* Breakdown */}
      <div className="glass-card p-5">
        <div className="mb-4 font-bold text-primary">還元の内訳</div>
        {shares.length === 0 ? (
          <p className="text-sm text-muted">
            まだレポート収益はありません。施工記録をブロックチェーンにアンカーして残すほど、将来の閲覧で収益が積み上がります。
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-default text-left text-xs text-muted">
                  <th className="py-2 pr-4 font-medium">日付</th>
                  <th className="py-2 pr-4 font-medium">車両 (VIN 末尾)</th>
                  <th className="py-2 pr-4 font-medium">あなたの記録 / 全記録</th>
                  <th className="py-2 pr-4 font-medium text-right">還元額</th>
                  <th className="py-2 font-medium">状態</th>
                </tr>
              </thead>
              <tbody>
                {shares.map((s) => (
                  <tr key={s.id} className="border-b border-border-subtle last:border-0">
                    <td className="py-2 pr-4 text-secondary">{formatDate(s.created_at)}</td>
                    <td className="py-2 pr-4 font-mono text-xs text-secondary">…{s.vin_code_normalized.slice(-6)}</td>
                    <td className="py-2 pr-4 text-secondary">
                      {s.cert_count} / {s.total_cert_count} 件
                    </td>
                    <td className="py-2 pr-4 text-right font-semibold text-primary">{formatJpy(s.amount)}</td>
                    <td className="py-2 text-secondary">{STATUS_LABEL[s.status] ?? s.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-xs text-muted">
        還元額は計上時のレポート価格と還元率、および車両に残された記録件数に基づく按分です。実際のお支払いは Ledra
        運営の精算処理後に行われます。
      </p>
    </div>
  );
}
