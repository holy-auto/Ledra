import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import PageHeader from "@/components/ui/PageHeader";
import Card from "@/components/ui/Card";

/**
 * 取引ハブ (Trades Hub)
 * ------------------------------------------------------------
 * BtoB プラットフォーム / 案件受発注 / 商談管理 / マーケット車両 /
 * 保険会社管理 を横断する取引系機能のランディングページ。
 * 商談のファネル (リード→商談→受発注→完了) を可視化する起点。
 */

type HubCard = {
  href: string;
  title: string;
  description: string;
  tag: string;
};

const HUB_CARDS: HubCard[] = [
  {
    href: "/admin/btob",
    title: "BtoBプラットフォーム",
    description: "在庫管理・在庫共有・商談を一元管理",
    tag: "MARKETPLACE",
  },
  {
    href: "/admin/orders",
    title: "案件受発注",
    description: "受注・発注案件の進捗・決済・メッセージ",
    tag: "ORDERS",
  },
  {
    href: "/admin/deals",
    title: "商談管理",
    description: "見積もり・提案・クロージングの進捗追跡",
    tag: "DEALS",
  },
  {
    href: "/admin/market-vehicles",
    title: "マーケット車両",
    description: "掲載車両の管理・更新・写真編集",
    tag: "INVENTORY",
  },
  {
    href: "/admin/insurers",
    title: "保険会社管理",
    description: "保険会社テナントの契約・権限設定",
    tag: "PARTNERS",
  },
];

export default async function TradesHubPage() {
  const supabase = await createSupabaseServerClient();
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes.user) redirect("/login?next=/admin/trades");

  return (
    <main className="space-y-6">
      <PageHeader
        tag="TRADES"
        title="取引ダッシュボード"
        description="BtoB・受発注・商談・マーケット車両・保険会社 — 取引系機能をひとつの画面から操作できます"
      />

      <Card padding="compact" variant="inset">
        <p className="text-[13px] text-secondary leading-relaxed">
          取引に関連する機能が分散しがちだった画面を集約しました。
          ファネル (リード → 商談 → 受発注 → 完了) を意識しながら各画面に移動できます。
        </p>
      </Card>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {HUB_CARDS.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="group block rounded-[var(--radius-lg)] transition-all"
          >
            <Card padding="default" className="h-full transition-shadow hover:shadow-md">
              <div className="flex flex-col gap-2">
                <span className="text-[10px] font-medium tracking-[0.14em] text-secondary uppercase">
                  {card.tag}
                </span>
                <h2 className="text-[16px] font-semibold text-primary leading-tight">
                  {card.title}
                </h2>
                <p className="text-[13px] text-secondary leading-relaxed">
                  {card.description}
                </p>
                <span className="mt-2 inline-flex items-center gap-1 text-[12px] font-medium text-accent transition-transform group-hover:translate-x-0.5">
                  開く
                  <svg
                    width="14"
                    height="14"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                  </svg>
                </span>
              </div>
            </Card>
          </Link>
        ))}
      </section>
    </main>
  );
}
