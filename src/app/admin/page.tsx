import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

const menuSections = [
  {
    title: "証明書・車両",
    items: [
      { label: "証明書一覧", href: "/admin/certificates", desc: "発行済み証明書の検索・閲覧・出力" },
      { label: "新規証明書を作成", href: "/admin/certificates/new", desc: "テンプレートから証明書を発行" },
      { label: "車両一覧", href: "/admin/vehicles", desc: "登録済み車両の確認・詳細・証明書発行" },
      { label: "車両を登録", href: "/admin/vehicles/new", desc: "車両マスタを新規登録" },
    ],
  },
  {
    title: "顧客",
    items: [
      { label: "顧客管理", href: "/admin/customers", desc: "車両に紐づく顧客の一覧・証明書発行" },
    ],
  },
  {
    title: "NFCタグ",
    items: [
      { label: "NFCタグ管理", href: "/admin/nfc", desc: "タグ台帳・状態・証明書／車両との紐付けを確認" },
    ],
  },
  {
    title: "テンプレート・ブランド",
    items: [
      { label: "テンプレート管理", href: "/admin/templates", desc: "証明書テンプレートの作成・編集" },
      { label: "ロゴ設定", href: "/admin/logo", desc: "証明書・公開ページに表示する店舗ロゴ" },
    ],
  },
  {
    title: "チーム・管理",
    items: [
      { label: "メンバー管理", href: "/admin/members", desc: "テナントに所属するメンバーの確認" },
      { label: "操作履歴", href: "/admin/audit", desc: "車両・証明書の操作イベントログ" },
    ],
  },
  {
    title: "契約・設定",
    items: [
      { label: "テナント設定", href: "/admin/settings", desc: "店舗情報・アカウント設定の確認・編集" },
      { label: "プラン・請求", href: "/admin/billing", desc: "ご利用プランの確認・変更・支払い管理" },
    ],
  },
];

export default async function AdminHome() {
  const supabase = await createSupabaseServerClient();

  const { data: userRes } = await supabase.auth.getUser();
  const userId = userRes?.user?.id;

  let tenantName: string | null = null;
  let certCount: number | null = null;
  let vehicleCount: number | null = null;

  if (userId) {
    const { data: membership } = await supabase
      .from("tenant_memberships")
      .select("tenant_id")
      .eq("user_id", userId)
      .limit(1)
      .single();

    if (membership?.tenant_id) {
      const { data: tenant } = await supabase
        .from("tenants")
        .select("name")
        .eq("id", membership.tenant_id)
        .single();

      tenantName = tenant?.name ?? null;

      const { count: cc } = await supabase
        .from("certificates")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", membership.tenant_id);

      const { count: vc } = await supabase
        .from("vehicles")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", membership.tenant_id);

      certCount = cc ?? 0;
      vehicleCount = vc ?? 0;
    }
  }

  return (
    <main className="min-h-screen bg-neutral-50 p-6">
      <div className="mx-auto max-w-5xl space-y-8">
        {/* Header */}
        <div className="space-y-2">
          <div className="inline-flex rounded-full border border-neutral-300 bg-white px-3 py-1 text-[11px] font-semibold tracking-[0.22em] text-neutral-600">
            DASHBOARD
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-neutral-900">
            管理ダッシュボード
          </h1>
          {tenantName ? (
            <p className="text-sm text-neutral-600">{tenantName}</p>
          ) : null}
        </div>

        {/* Stats */}
        {certCount !== null && (
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
              <div className="text-xs font-semibold tracking-[0.18em] text-neutral-500">CERTIFICATES</div>
              <div className="mt-2 text-2xl font-bold text-neutral-900">{certCount}</div>
              <div className="mt-1 text-xs text-neutral-500">発行済み証明書</div>
            </div>
            <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
              <div className="text-xs font-semibold tracking-[0.18em] text-neutral-500">VEHICLES</div>
              <div className="mt-2 text-2xl font-bold text-neutral-900">{vehicleCount}</div>
              <div className="mt-1 text-xs text-neutral-500">登録車両</div>
            </div>
          </section>
        )}

        {/* Menu Sections */}
        {menuSections.map((section) => (
          <section key={section.title} className="space-y-3">
            <h2 className="text-sm font-semibold tracking-wide text-neutral-500">
              {section.title}
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {section.items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="group rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm transition hover:border-neutral-400 hover:shadow-md"
                >
                  <div className="text-sm font-semibold text-neutral-900 group-hover:text-black">
                    {item.label}
                  </div>
                  <div className="mt-1 text-xs text-neutral-500">
                    {item.desc}
                  </div>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
