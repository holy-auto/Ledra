import Link from "next/link";
import { Section } from "./Section";
import { SectionHeading } from "./SectionHeading";
import { ScrollReveal } from "./ScrollReveal";
import { NetworkStatsGrid, type NetworkStatItem } from "./NetworkStatsGrid";
import { NetworkGraph } from "./diagrams/NetworkGraph";
import { getNetworkStats } from "@/lib/marketing/network";

/**
 * トップページ用の要約セクション。詳細は /network で見せる
 * (GrowthJourney の「事業の数字をすべて見る」と同じ、要約→詳細ページの導線)。
 */
export async function NetworkPreviewSection() {
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
    <Section bg="alt" id="network">
      <SectionHeading
        title="点と線で見る、Ledraのネットワーク"
        subtitle="証明書を軸に、施工店・メーカー・保険会社・ユーザーがどれだけつながっているかを可視化しています。"
      />
      <ScrollReveal variant="fade-up">
        <div className="mx-auto max-w-5xl">
          <NetworkStatsGrid items={items} />
        </div>
      </ScrollReveal>
      <ScrollReveal variant="fade-in" delay={150}>
        <div className="mx-auto mt-10 max-w-4xl">
          <NetworkGraph
            certificateCount={stats.certificateCount}
            shopCount={stats.shopCount}
            customerCount={stats.customerCount}
            regions={stats.regions}
            manufacturers={stats.manufacturers}
            insurers={stats.insurers}
            maxSatellites={4}
            className="w-full h-auto"
          />
        </div>
      </ScrollReveal>
      <ScrollReveal variant="fade-in" delay={250}>
        <div className="mt-8 text-center">
          <Link
            href="/network"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-400 hover:text-blue-300 transition-colors"
          >
            ネットワークの広がりを詳しく見る →
          </Link>
        </div>
      </ScrollReveal>
    </Section>
  );
}
