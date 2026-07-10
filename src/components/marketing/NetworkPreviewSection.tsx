import Link from "next/link";
import { Section } from "./Section";
import { SectionHeading } from "./SectionHeading";
import { ScrollReveal } from "./ScrollReveal";
import { NetworkStatsGrid } from "./NetworkStatsGrid";
import { NetworkGraph } from "./diagrams/NetworkGraph";
import { getNetworkStats, toNetworkStatItems } from "@/lib/marketing/network";

/**
 * トップページ用の要約セクション。詳細は /network で見せる
 * (GrowthJourney の「事業の数字をすべて見る」と同じ、要約→詳細ページの導線)。
 */
export async function NetworkPreviewSection() {
  const stats = await getNetworkStats();
  const items = toNetworkStatItems(stats);

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
            manufacturerCount={stats.manufacturerCount}
            insurerCount={stats.insurerCount}
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
