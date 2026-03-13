import Link from "next/link";

const portals = [
  {
    label: "管理者ポータル",
    sub: "証明書の発行・管理・PDF出力",
    href: "/admin/login",
    badge: "ADMIN",
    color: "bg-neutral-900 text-white hover:bg-neutral-700",
    badgeColor: "bg-neutral-100 text-neutral-700",
  },
  {
    label: "保険会社ポータル",
    sub: "証明書の検索・CSV/PDFエクスポート",
    href: "/insurer/login",
    badge: "INSURER",
    color: "bg-sky-700 text-white hover:bg-sky-600",
    badgeColor: "bg-sky-50 text-sky-700",
  },
  {
    label: "HolyMarket",
    sub: "BtoB中古車在庫共有プラットフォーム",
    href: "/market/login",
    badge: "MARKET",
    color: "bg-blue-600 text-white hover:bg-blue-500",
    badgeColor: "bg-blue-50 text-blue-700",
  },
  {
    label: "顧客ポータル",
    sub: "施工証明書の閲覧・PDF取得",
    href: "/c",
    badge: "CUSTOMER",
    color: "bg-emerald-700 text-white hover:bg-emerald-600",
    badgeColor: "bg-emerald-50 text-emerald-700",
  },
];

const features = [
  {
    icon: "📄",
    title: "WEB施工証明書",
    desc: "施工内容をデジタルで記録し、顧客へQRコード付きPDFを即時発行。改ざん不可な証明をクラウドで管理。",
  },
  {
    icon: "🚗",
    title: "HolyMarket",
    desc: "ディーラー間でリアルタイムに在庫を共有。招待制のクローズドマーケットで安心して売買・商談。",
  },
  {
    icon: "🔍",
    title: "保険会社連携",
    desc: "保険会社が証明書番号・顧客名・車両情報で即座に検索。CSV・PDF一括エクスポートに対応。",
  },
  {
    icon: "📊",
    title: "プラン別機能制御",
    desc: "Mini / Standard / Pro の3プランで機能を柔軟に制御。Stripeによる自動課金管理。",
  },
];

export default function HomePage() {
  return (
    <div className="min-h-screen bg-neutral-50 font-sans">
      {/* Hero */}
      <header className="mx-auto max-w-5xl px-6 pt-24 pb-16 text-center">
        <div className="inline-flex rounded-full border border-neutral-300 bg-white px-3 py-1 text-[11px] font-semibold tracking-[0.22em] text-neutral-600 mb-6">
          HOLY-CERT
        </div>
        <h1 className="text-4xl font-bold tracking-tight text-neutral-900 sm:text-5xl">
          施工証明書を、もっとスマートに。
        </h1>
        <p className="mt-4 text-lg text-neutral-500 max-w-2xl mx-auto">
          WEB施工証明書の発行・管理から、BtoB中古車在庫共有まで。<br />
          すべてのステークホルダーを一つのプラットフォームで繋ぎます。
        </p>
      </header>

      {/* Portal Cards */}
      <section className="mx-auto max-w-5xl px-6 pb-20">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {portals.map((p) => (
            <Link
              key={p.href}
              href={p.href}
              className="group flex flex-col gap-4 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm transition hover:shadow-md"
            >
              <span
                className={`inline-flex w-fit rounded-full px-2.5 py-0.5 text-[10px] font-bold tracking-widest ${p.badgeColor}`}
              >
                {p.badge}
              </span>
              <div>
                <div className="text-base font-semibold text-neutral-900">{p.label}</div>
                <div className="mt-1 text-xs text-neutral-500">{p.sub}</div>
              </div>
              <span
                className={`mt-auto inline-flex w-full items-center justify-center rounded-xl px-4 py-2 text-sm font-medium transition ${p.color}`}
              >
                ログイン →
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="border-t border-neutral-200 bg-white py-20">
        <div className="mx-auto max-w-5xl px-6">
          <h2 className="text-center text-2xl font-bold tracking-tight text-neutral-900 mb-12">
            主な機能
          </h2>
          <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {features.map((f) => (
              <div key={f.title} className="space-y-3">
                <div className="text-3xl">{f.icon}</div>
                <div className="font-semibold text-neutral-900">{f.title}</div>
                <div className="text-sm text-neutral-500 leading-relaxed">{f.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-neutral-200 bg-neutral-50 py-10 text-center">
        <div className="mx-auto max-w-5xl px-6 space-y-3">
          <div className="text-sm font-semibold text-neutral-700">HOLY-CERT</div>
          <div className="flex flex-wrap justify-center gap-4 text-xs text-neutral-400">
            <Link href="/privacy" className="hover:text-neutral-700 transition">プライバシーポリシー</Link>
            <Link href="/terms" className="hover:text-neutral-700 transition">利用規約</Link>
            <Link href="/legal" className="hover:text-neutral-700 transition">特定商取引法に基づく表示</Link>
            <Link href="/superadmin" className="hover:text-neutral-700 transition">運営管理</Link>
          </div>
          <div className="text-xs text-neutral-400">© {new Date().getFullYear()} HOLY-CERT. All rights reserved.</div>
        </div>
      </footer>
    </div>
  );
}
