import { PageHero } from "@/components/marketing/PageHero";
import { Section } from "@/components/marketing/Section";
import { SectionHeading } from "@/components/marketing/SectionHeading";
import { ScrollReveal } from "@/components/marketing/ScrollReveal";
import { CTABanner } from "@/components/marketing/CTABanner";
import { NetworkStatsGrid, type NetworkStatItem } from "@/components/marketing/NetworkStatsGrid";
import { NetworkGraph } from "@/components/marketing/diagrams/NetworkGraph";
import { getNetworkStats, type NetworkNode, type RegionalNode } from "@/lib/marketing/network";

export const metadata = {
  title: "ネットワークの広がり ── 証明書・施工店・メーカー・保険会社",
  description:
    "Ledra 上で発行された施工証明書、つながっている施工店・メーカー・保険会社・ユーザーの広がりを、点と線のネットワーク図と実数値で公開しています。",
  alternates: { canonical: "/network" },
};

function BreakdownList({
  title,
  unit,
  items,
  emptyText,
}: {
  title: string;
  unit: string;
  items: { label: string; count: number }[];
  emptyText: string;
}) {
  const total = items.reduce((s, i) => s + i.count, 0);
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6 md:p-7">
      <h3 className="text-sm font-bold text-white mb-5">{title}</h3>
      {items.length === 0 ? (
        <p className="text-sm text-white">{emptyText}</p>
      ) : (
        <div className="space-y-3.5">
          {items.slice(0, 12).map((item) => {
            const pct = total > 0 ? Math.round((item.count / total) * 100) : 0;
            return (
              <div key={item.label}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-white">{item.label}</span>
                  <span className="text-sm font-semibold text-white">
                    {item.count.toLocaleString()}
                    {unit}
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-blue-500 to-violet-500"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function toBreakdown(nodes: NetworkNode[]) {
  return nodes.map((n) => ({ label: n.name, count: n.shopCount }));
}

function regionsToBreakdown(regions: RegionalNode[]) {
  return regions.map((r) => ({ label: r.prefecture, count: r.count }));
}

export default async function NetworkPage() {
  const stats = await getNetworkStats();

  const items: NetworkStatItem[] = [
    { label: "証明書件数", value: stats.certificateCount, unit: "件" },
    { label: "施工店", value: stats.shopCount, unit: "店" },
    { label: "メーカー", value: stats.manufacturerCount, unit: "社" },
    { label: "保険会社", value: stats.insurerCount, unit: "社" },
    { label: "エンドユーザー", value: stats.customerCount, unit: "人" },
    { label: "利用アカウント", value: stats.accountCount, unit: "件" },
  ];

  return (
    <>
      <PageHero
        badge="NETWORK"
        title="点と線で見る、Ledraのネットワーク"
        subtitle="施工証明書というひとつの記録を軸に、施工店・メーカー・保険会社・ユーザーがどれだけつながり、全国に広がっているかを公開します。"
      />

      <Section id="numbers">
        <SectionHeading title="いまのつながり" subtitle="1時間ごとに本番DBから再集計しています。" />
        <ScrollReveal variant="fade-up">
          <div className="mx-auto max-w-5xl">
            <NetworkStatsGrid items={items} />
          </div>
        </ScrollReveal>
        <ScrollReveal variant="fade-in" delay={150}>
          <div className="mx-auto mt-6 max-w-5xl flex flex-col sm:flex-row items-start sm:items-center gap-4 rounded-xl border border-white/[0.06] bg-white/[0.02] px-5 py-4">
            <div className="flex items-center gap-2">
              <span
                className={`block w-2 h-2 rounded-full ${stats.isLive ? "bg-emerald-400 animate-[pulse-soft_2s_ease-in-out_infinite]" : "bg-white/40"}`}
              />
              <span className="text-xs font-medium text-white">
                {stats.isLive ? "本番DBから直接集計" : "DBに到達できていません — フォールバック表示"}
              </span>
            </div>
          </div>
        </ScrollReveal>
      </Section>

      <Section bg="alt" id="graph">
        <SectionHeading
          title="ネットワーク図"
          subtitle="中心の証明書から、施工店（全国の地域別）・メーカー（認定契約）・保険会社（提携契約）へとつながりが伸びています。"
        />
        <ScrollReveal variant="fade-up">
          <div className="mx-auto max-w-5xl">
            <NetworkGraph
              certificateCount={stats.certificateCount}
              shopCount={stats.shopCount}
              customerCount={stats.customerCount}
              regions={stats.regions}
              manufacturers={stats.manufacturers}
              insurers={stats.insurers}
              maxSatellites={6}
              className="w-full h-auto"
            />
          </div>
        </ScrollReveal>
      </Section>

      <Section id="breakdown">
        <SectionHeading title="内訳" subtitle="地域・提携メーカー・提携保険会社ごとの広がりです。" />
        <ScrollReveal variant="fade-up">
          <div className="mx-auto max-w-5xl grid grid-cols-1 md:grid-cols-3 gap-5">
            <BreakdownList
              title="地域別 施工店数"
              unit="店"
              items={regionsToBreakdown(stats.regions)}
              emptyText="地域データはまだありません。"
            />
            <BreakdownList
              title="メーカー別 認定施工店数"
              unit="店"
              items={toBreakdown(stats.manufacturers)}
              emptyText="認定メーカーはまだありません。"
            />
            <BreakdownList
              title="保険会社別 契約施工店数"
              unit="店"
              items={toBreakdown(stats.insurers)}
              emptyText="提携保険会社はまだありません。"
            />
          </div>
        </ScrollReveal>
      </Section>

      <CTABanner
        title="このネットワークに、あなたの店舗も。"
        subtitle="施工証明書の発行から、メーカー認定・保険会社連携まで。Ledra で記録を業界の共通言語にしませんか。"
        primaryLabel="無料で試す"
        primaryHref="/signup"
        secondaryLabel="お問い合わせ"
        secondaryHref="/contact"
      />
    </>
  );
}
