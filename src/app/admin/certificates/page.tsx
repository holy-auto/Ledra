import dynamic from "next/dynamic";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";

const CertificatesTableClient = dynamic(() => import("./CertificatesTableClient"), {
  loading: () => <div className="animate-pulse h-40 rounded-2xl bg-surface-hover" />,
});
import { canUseFeature } from "@/lib/billing/planFeatures";
import { buildBillingDenyUrl } from "@/lib/billing/billingRedirect";
import PageHeader from "@/components/ui/PageHeader";
import EmptyStateGuide from "@/components/ui/EmptyStateGuide";
import { escapeIlike, escapePostgrestValue } from "@/lib/sanitize";
import CertificatesModeSwitch from "./CertificatesModeSwitch";
// IndexedDB を読むためクライアントのみで描画 (SSR では何も表示しない)
// Next 16 では Server Component から `dynamic({ ssr: false })` を直接
// 呼べないため、ssr: false 指定をクライアントラッパーに閉じ込めている。
import PendingOfflineCerts from "./PendingOfflineCertsClient";

type SearchParams = { q?: string; hidden?: string };

async function getMyTenantId(supabase: any) {
  const { data, error } = await supabase.from("tenant_memberships").select("tenant_id").limit(1).single();
  if (error || !data) return null;
  return data.tenant_id as string;
}

export default async function Page({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const showHidden = sp.hidden === "1";
  const buildHref = (params: { q?: string; hidden?: boolean }) => {
    const usp = new URLSearchParams();
    if (params.q) usp.set("q", params.q);
    if (params.hidden) usp.set("hidden", "1");
    const qs = usp.toString();
    return `/admin/certificates${qs ? `?${qs}` : ""}`;
  };
  const returnTo = buildHref({ q, hidden: showHidden });

  const supabase = await createSupabaseServerClient();
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes.user) redirect("/login?next=/admin/certificates");

  const tenantId = await getMyTenantId(supabase);
  if (!tenantId) {
    return (
      <div className="space-y-6">
        <PageHeader tag="証明書管理" title="証明書一覧" />
        <div className="glass-card p-4 text-sm text-danger">
          tenant_memberships が見つかりません。あなたのユーザーを tenant に紐付けてください。
        </div>
      </div>
    );
  }

  type CertListRow = {
    public_id: string;
    status: string;
    customer_name: string;
    created_at: string;
    is_hidden: boolean;
  };
  let certQuery = supabase
    .from("certificates")
    .select("public_id,status,customer_name,created_at,is_hidden")
    .eq("tenant_id", tenantId)
    .eq("is_hidden", showHidden)
    .order("created_at", { ascending: false })
    .limit(50);

  if (q) {
    const sq = escapePostgrestValue(escapeIlike(q));
    certQuery = certQuery.or(`public_id.ilike.%${sq}%,customer_name.ilike.%${sq}%`);
  }

  const [{ data: t }, { data: rows, error }, { count: hiddenCount }] = await Promise.all([
    supabase.from("tenants").select("plan_tier,is_active").eq("id", tenantId).single(),
    certQuery.returns<CertListRow[]>(),
    supabase
      .from("certificates")
      .select("public_id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("is_hidden", true),
  ]);

  const planTier = String(t?.plan_tier ?? "pro");
  const isActive = !!t?.is_active;
  const canIssue = isActive && canUseFeature(planTier, "issue_certificate");

  const denyReason = !isActive ? "inactive" : "plan";
  const issueHref = canIssue
    ? "/admin/certificates/new"
    : buildBillingDenyUrl({ reason: denyReason, action: "issue_certificate", returnTo });
  if (error)
    return (
      <div className="space-y-6">
        <div className="text-danger">読み込みエラー: {error.message}</div>
      </div>
    );

  const allRows = rows ?? [];
  const activeCount = allRows.filter((r) => r.status === "active").length;
  const voidCount = allRows.filter((r) => r.status === "void").length;
  const hiddenTotal = hiddenCount ?? 0;
  const isFirstUse = allRows.length === 0 && !q && !showHidden;

  const adminContent = (
    <>
      {!isActive ? (
        <div className="glass-card p-4 text-sm text-warning">
          お支払い停止中のため、一部機能（発行/出力）が制限されています。{" "}
          <Link className="underline font-medium" href="/admin/billing">
            課金ページへ
          </Link>
        </div>
      ) : null}

      <PageHeader
        tag="証明書管理"
        title={showHidden ? "非表示の証明書" : "証明書一覧"}
        description={
          isFirstUse
            ? "施工証明書の発行・管理を行います。"
            : showHidden
              ? `非表示にした証明書を表示${q ? ` / 検索: "${q}"` : ""}`
              : `最新50件を表示${q ? ` / 検索: "${q}"` : ""}`
        }
        actions={
          <div className="flex gap-3 items-center flex-wrap">
            {showHidden ? (
              <Link className="btn-secondary" href={buildHref({ q })}>
                ← 通常一覧に戻る
              </Link>
            ) : (
              <Link
                className={canIssue ? "btn-primary" : "btn-primary opacity-50"}
                href={issueHref}
                aria-disabled={!canIssue}
                title={!canIssue ? "課金状態/プランにより利用不可" : ""}
              >
                + 新規発行
              </Link>
            )}
          </div>
        }
      />

      {isFirstUse ? (
        <EmptyStateGuide
          icon="🪪"
          title="最初の証明書を発行してみましょう"
          description="施工内容と写真を記録して、QRコード付きのデジタル証明書を発行します。発行した証明書は顧客にURLで共有でき、保険会社からも検索できます。"
          steps={[
            {
              title: "顧客・車両を選択",
              description: "新規発行画面から既存の顧客・車両を選ぶか、その場で登録できます。",
            },
            {
              title: "施工内容と写真を入力",
              description: "施工メニュー・使用したコーティング剤・施工写真をアップロード。",
            },
            { title: "発行 → 顧客に共有", description: "QRコードと公開URLが生成され、そのまま顧客に渡せます。" },
          ]}
          primaryAction={{ label: "+ 新規発行", href: issueHref }}
          secondaryAction={{ label: "車両一覧を見る", href: "/admin/vehicles" }}
        />
      ) : null}

      {!isFirstUse && (
        <>
          {/* Stats */}
          <section className="grid gap-4 sm:grid-cols-3">
            <div className="glass-card p-5">
              <div className="text-xs font-semibold tracking-[0.18em] text-muted">合計</div>
              <div className="mt-2 text-2xl font-bold text-primary">{allRows.length}</div>
              <div className="mt-1 text-xs text-muted">表示中の証明書</div>
            </div>
            <div className="glass-card p-5">
              <div className="text-xs font-semibold tracking-[0.18em] text-muted">有効</div>
              <div className="mt-2 text-2xl font-bold text-success">{activeCount}</div>
              <div className="mt-1 text-xs text-muted">有効な証明書</div>
            </div>
            <div className="glass-card p-5">
              <div className="text-xs font-semibold tracking-[0.18em] text-muted">無効</div>
              <div className="mt-2 text-2xl font-bold text-danger">{voidCount}</div>
              <div className="mt-1 text-xs text-muted">無効の証明書</div>
            </div>
          </section>

          {/* Search */}
          <section className="glass-card p-5">
            <form className="flex gap-3 items-end flex-wrap" action="/admin/certificates" method="get">
              {showHidden && <input type="hidden" name="hidden" value="1" />}
              <div className="flex-1 min-w-0 space-y-1">
                <label className="text-xs text-muted">検索</label>
                <input name="q" defaultValue={q} placeholder="証明書ID / お客様名で検索" className="input-field" />
              </div>
              <button className="btn-secondary">検索</button>
              {q && (
                <Link className="btn-ghost" href={buildHref({ hidden: showHidden })}>
                  クリア
                </Link>
              )}
            </form>
            {!showHidden && hiddenTotal > 0 && (
              <div className="mt-3 text-xs text-muted">
                ミスなどで非表示にした証明書が <span className="font-semibold text-primary">{hiddenTotal}</span>{" "}
                件あります。{" "}
                <Link
                  className="underline font-medium text-accent hover:text-accent/80"
                  href={buildHref({ q, hidden: true })}
                >
                  非表示の証明書を確認
                </Link>
              </div>
            )}
          </section>

          {!showHidden && <PendingOfflineCerts />}

          <CertificatesTableClient rows={allRows} q={q} showHidden={showHidden} />
        </>
      )}
    </>
  );

  return (
    <div className="space-y-6">
      <CertificatesModeSwitch adminContent={adminContent} />
    </div>
  );
}
