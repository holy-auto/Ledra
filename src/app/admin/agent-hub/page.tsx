import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import PageHeader from "@/components/ui/PageHeader";
import Card from "@/components/ui/Card";

/**
 * 代理店ハブ (Agent Hub)
 * ------------------------------------------------------------
 * 代理店向けの7つの運用機能を1画面に集約するランディング。
 * 既存の個別ページ (/admin/agent-*) は引き続き利用可能で、
 * このハブはカード形式で素早い導線を提供する。
 */

type HubCard = {
  href: string;
  title: string;
  description: string;
  tag: string;
};

const HUB_CARDS: HubCard[] = [
  {
    href: "/admin/agent-announcements",
    title: "お知らせ配信",
    description: "代理店向けに告知を作成・配信する",
    tag: "COMMUNICATION",
  },
  {
    href: "/admin/agent-campaigns",
    title: "キャンペーン",
    description: "期間限定のインセンティブを設定する",
    tag: "MARKETING",
  },
  {
    href: "/admin/agent-notifications",
    title: "通知管理",
    description: "システム通知・メール通知の履歴を確認する",
    tag: "OPS",
  },
  {
    href: "/admin/agent-faq",
    title: "FAQ管理",
    description: "よくある質問を編集・公開する",
    tag: "SUPPORT",
  },
  {
    href: "/admin/agent-support",
    title: "サポートチケット",
    description: "代理店からの問い合わせに対応する",
    tag: "SUPPORT",
  },
  {
    href: "/admin/agent-training",
    title: "研修管理",
    description: "研修コンテンツをアップロード・配信する",
    tag: "ENABLEMENT",
  },
  {
    href: "/admin/agent-invoices",
    title: "請求書管理",
    description: "代理店向け請求書・支払状況を確認する",
    tag: "FINANCE",
  },
  {
    href: "/admin/agents/materials",
    title: "営業資料管理",
    description: "代理店が利用する資料をアップロードする",
    tag: "ENABLEMENT",
  },
];

export default async function AgentHubPage() {
  const supabase = await createSupabaseServerClient();
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes.user) redirect("/login?next=/admin/agent-hub");

  return (
    <main className="space-y-6">
      <PageHeader
        tag="AGENT HUB"
        title="代理店ハブ"
        description="代理店向けの運用機能 (お知らせ・キャンペーン・研修・請求・サポート等) をひとつの画面から操作できます"
      />

      <Card padding="compact" variant="inset">
        <p className="text-[13px] text-secondary leading-relaxed">
          従来 7 つに分散していた代理店向け管理画面をここから横断的にアクセスできます。
          個別の URL (<code className="px-1 py-0.5 rounded bg-border-subtle dark:bg-[rgba(255,255,255,0.07)]">/admin/agent-*</code>) も引き続き利用可能です。
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
