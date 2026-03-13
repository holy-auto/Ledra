import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import CertificatesTableClient from "./CertificatesTableClient";
import { canUseFeature } from "@/lib/billing/planFeatures";
import { buildBillingDenyUrl } from "@/lib/billing/billingRedirect";

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
      <main className="min-h-screen bg-neutral-50 p-6">
        <p className="text-sm text-neutral-600">tenant_memberships が見つかりません。</p>
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

  if (q) query = query.or(`public_id.ilike.%${q}%,customer_name.ilike.%${q}%`);

  const { data: rows, error } = await query;
  if (error) {
    return (
      <main className="min-h-screen bg-neutral-50 p-6">
        <p className="text-sm text-red-700">読み込みエラー: {error.message}</p>
      </main>
    );
  }

  async function signOut() {
    "use server";
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
    redirect("/login");
  }

  const allRows = rows ?? [];
  const activeCount = allRows.filter((r) => r.status === "active").length;
  const voidCount = allRows.filter((r) => r.status === "void").length;

  return (
    <main className="min-h-screen bg-neutral-50 p-6">
      <div className="mx-auto max-w-7xl space-y-6">

        {/* Billing warning */}
        {!isActive ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            お支払い停止中のため、一部機能（発行/出力）が制限されています。{" "}
            <Link className="underline font-medium" href="/admin/billing">
              課金ページへ
            </Link>
          </div>
        ) : null}

        {/* Header */}
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-3">
            <div className="inline-flex rounded-full border border-neutral-300 bg-white px-3 py-1 text-[11px] font-semibold tracking-[0.22em] text-neutral-600">
              CERTIFICATES
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-neutral-900">
                証明書一覧
              </h1>
              <p className="mt-2 text-sm text-neutral-600">
                発行済み施工証明書の確認・出力・無効化。最新50件表示。
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-3 items-center">
            {/* Search */}
            <form className="flex gap-2" action="/admin/certificates" method="get">
              <input
                name="q"
                defaultValue={q}
                placeholder="ID / 顧客名で検索"
                className="rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm w-56 focus:outline-none focus:ring-2 focus:ring-neutral-400"
              />
              <button
                type="submit"
                className="rounded-xl border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
              >
                検索
              </button>
              {q ? (
                <Link
                  href="/admin/certificates"
                  className="rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
                >
                  クリア
                </Link>
              ) : null}
            </form>

            <Link
              href={issueHref}
              aria-disabled={!canIssue}
              title={!canIssue ? "課金状態/プランにより利用不可 → 課金ページへ" : ""}
              className={
                canIssue
                  ? "rounded-xl border border-neutral-900 bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700"
                  : "rounded-xl border border-neutral-300 bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-400 cursor-not-allowed"
              }
            >
              + 新規発行
            </Link>

            <Link
              href="/admin"
              className="rounded-xl border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
            >
              ダッシュボード
            </Link>

            <form action={signOut}>
              <button
                type="submit"
                className="rounded-xl border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
              >
                ログアウト
              </button>
            </form>
          </div>
        </header>

        {/* Stats */}
        <section className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
            <div className="text-xs font-semibold tracking-[0.18em] text-neutral-500">TOTAL</div>
            <div className="mt-2 text-2xl font-bold text-neutral-900">{allRows.length}</div>
            <div className="mt-1 text-xs text-neutral-500">表示中の証明書数</div>
          </div>
          <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
            <div className="text-xs font-semibold tracking-[0.18em] text-neutral-500">ACTIVE</div>
            <div className="mt-2 text-2xl font-bold text-emerald-600">{activeCount}</div>
            <div className="mt-1 text-xs text-neutral-500">有効な証明書</div>
          </div>
          <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
            <div className="text-xs font-semibold tracking-[0.18em] text-neutral-500">VOID</div>
            <div className="mt-2 text-2xl font-bold text-neutral-400">{voidCount}</div>
            <div className="mt-1 text-xs text-neutral-500">無効化済み</div>
          </div>
        </section>

        {/* Table */}
        <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
          <div className="mb-4">
            <div className="text-xs font-semibold tracking-[0.18em] text-neutral-500">CERTIFICATE LIST</div>
            <div className="mt-1 text-lg font-semibold text-neutral-900">証明書リスト</div>
          </div>
          <CertificatesTableClient rows={allRows as any} q={q} />
        </section>

      </div>
    </main>
  );
}
