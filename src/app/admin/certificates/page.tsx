import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import CertificatesTableClient from "./CertificatesTableClient";
import { canUseFeature } from "@/lib/billing/planFeatures";
import { buildBillingDenyUrl } from "@/lib/billing/billingRedirect";
import PageHeader from "@/components/ui/PageHeader";
import { escapeIlike } from "@/lib/sanitize";

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
      <main className="space-y-6">
        <PageHeader tag="CERTIFICATES" title="管理：証明書一覧" />
        <div className="glass-card p-4 text-sm text-red-500">
          tenant_memberships が見つかりません。あなたのユーザーを tenant に紐付けてください。
        </div>
      </main>
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
    const sq = escapeIlike(q);
    query = query.or(`public_id.ilike.%${sq}%,customer_name.ilike.%${sq}%`);
  }

  const { data: rows, error } = await query;
  if (error) return <main className="space-y-6"><div className="text-red-500">読み込みエラー: {error.message}</div></main>;

  const linkCls = (enabled: boolean) => "text-sm underline " + (enabled ? "text-[#0071e3]" : "opacity-50 text-muted");

  return (
    <main className="space-y-6">
      {!isActive ? (
        <div className="glass-card p-4 text-sm text-amber-400">
          お支払い停止中のため、一部機能（発行/出力）が制限されています。{" "}
          <Link className="underline font-medium" href="/admin/billing">
            課金ページへ
          </Link>
        </div>
      ) : null}

      <PageHeader
        tag="CERTIFICATES"
        title="管理：証明書一覧"
        description={`tenant: ${tenantId} / 最新50件`}
        actions={
          <div className="flex gap-3 items-center flex-wrap">
            <form className="flex gap-2" action="/admin/certificates" method="get">
              <input name="q" defaultValue={q} placeholder="検索（ID / 名前）" className="input-field w-full sm:w-64" />
              <button className="btn-secondary">検索</button>
              <Link className="text-sm underline self-center text-muted hover:text-primary" href="/admin/certificates">
                クリア
              </Link>
            </form>

            <Link
              className={linkCls(canIssue)}
              href={issueHref}
              aria-disabled={!canIssue}
              title={!canIssue ? "課金状態/プランにより利用不可 → 課金ページへ" : ""}
            >
              新規発行
            </Link>
          </div>
        }
      />

      <CertificatesTableClient rows={(rows ?? []) as any} q={q} />
    </main>
  );
}
