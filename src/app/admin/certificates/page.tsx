import dynamic from "next/dynamic";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";

const CertificatesTableClient = dynamic(() => import("./CertificatesTableClient"), {
  loading: () => <div className="animate-pulse h-40 rounded-2xl bg-[rgba(0,0,0,0.04)]" />,
});
import { canUseFeature } from "@/lib/billing/planFeatures";
import { buildBillingDenyUrl } from "@/lib/billing/billingRedirect";
import PageHeader from "@/components/ui/PageHeader";
import { escapeIlike, escapePostgrestValue } from "@/lib/sanitize";

type SearchParams = { q?: string };

async function getMyTenantId(supabase: any) {
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes.user) return null;

  const { data, error } = await supabase
    .from("tenant_memberships")
    .select("tenant_id")
    .limit(1)
    .single();

  if (error || !data) return null;
  return data.tenant_id as string;
}

export default async function Page({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const returnTo = `/admin/certificates${q ? `?q=${encodeURIComponent(q)}` : ""}`;

  const supabase = await createSupabaseServerClient();
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes.user) redirect("/login?next=/admin/certificates");

  const tenantId = await getMyTenantId(supabase);
  if (!tenantId) {
    return (
      <div className="space-y-6">
        <PageHeader tag="証明書管理" title="証明書一覧" />
        <div className="glass-card p-4 text-sm text-red-500">
          tenant_memberships が見つかりません。あなたのユーザーを tenant に紐付けてください。
        </div>
      </div>
    );
  }

  const { data: t } = await supabase.from("tenants").select("plan_tier,is_active").eq("id", tenantId).single();
  const planTier = String(t?.plan_tier ?? "pro");
  const isActive = !!t?.is_active;
  const canIssue = isActive && canUseFeature(planTier, "issue_certificate");

  const denyReason = !isActive ? "inactive" : "plan";
  const issueHref = canIssue
    ? "/admin/certificates/new"
    : buildBillingDenyUrl({ reason: denyReason, action: "issue_certificate", returnTo });

  let query = supabase
    .from("certificates")
    .select("public_id,status,customer_name,created_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (q) {
    const sq = escapePostgrestValue(escapeIlike(q));
    query = query.or(`public_id.ilike.%${sq}%,customer_name.ilike.%${sq}%`);
  }

  const { data: rows, error } = await query;
  if (error) return <div className="space-y-6"><div className="text-red-500">読み込みエラー: {error.message}</div></div>;

  const allRows = rows ?? [];
  const activeCount = allRows.filter((r) => r.status === "active").length;
  const voidCount = allRows.filter((r) => r.status === "void").length;

  return (
    <div className="space-y-6">
      {!isActive ? (
        <div className="glass-card p-4 text-sm text-amber-400">
          お支払い停止中のため、一部機能（発行/出力）が制限されています。{" "}
          <Link className="underline font-medium" href="/admin/billing">
            課金ページへ
          </Link>
        </div>
      ) : null}

      <PageHeader
        tag="証明書管理"
        title="証明書一覧"
        description={`最新50件を表示${q ? ` / 検索: "${q}"` : ""}`}
        actions={
          <div className="flex gap-3 items-center flex-wrap">
            <Link
              className={canIssue ? "btn-primary" : "btn-primary opacity-50"}
              href={issueHref}
              aria-disabled={!canIssue}
              title={!canIssue ? "課金状態/プランにより利用不可" : ""}
            >
              + 新規発行
            </Link>
          </div>
        }
      />

      {/* Stats */}
      <section className="grid gap-4 sm:grid-cols-3">
        <div className="glass-card p-5">
          <div className="text-xs font-semibold tracking-[0.18em] text-muted">合計</div>
          <div className="mt-2 text-2xl font-bold text-primary">{allRows.length}</div>
          <div className="mt-1 text-xs text-muted">表示中の証明書</div>
        </div>
        <div className="glass-card p-5">
          <div className="text-xs font-semibold tracking-[0.18em] text-muted">有効</div>
          <div className="mt-2 text-2xl font-bold text-[#28a745]">{activeCount}</div>
          <div className="mt-1 text-xs text-muted">有効な証明書</div>
        </div>
        <div className="glass-card p-5">
          <div className="text-xs font-semibold tracking-[0.18em] text-muted">無効</div>
          <div className="mt-2 text-2xl font-bold text-[#d1242f]">{voidCount}</div>
          <div className="mt-1 text-xs text-muted">無効の証明書</div>
        </div>
      </section>

      {/* Search */}
      <section className="glass-card p-5">
        <form className="flex gap-3 items-end flex-wrap" action="/admin/certificates" method="get">
          <div className="flex-1 min-w-0 space-y-1">
            <label className="text-xs text-muted">検索</label>
            <input name="q" defaultValue={q} placeholder="証明書ID / お客様名で検索" className="input-field" />
          </div>
          <button className="btn-secondary">検索</button>
          {q && (
            <Link className="btn-ghost" href="/admin/certificates">
              クリア
            </Link>
          )}
        </form>
      </section>

      <CertificatesTableClient rows={allRows as any} q={q} />
    </div>
  );
}
