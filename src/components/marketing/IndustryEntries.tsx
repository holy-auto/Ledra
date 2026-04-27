import Link from "next/link";
import { Section } from "./Section";
import { SectionHeading } from "./SectionHeading";
import { ScrollReveal } from "./ScrollReveal";

/**
 * IndustryEntries — 業態別 LP への入口。
 *
 * SmartHR が業種別 / 規模別 LP を持つのに倣い、施工系の業態別に動線を分ける。
 * 詳細 LP は /for-shops 配下に随時追加予定。現時点では未公開ページは
 * "Coming soon" バッジを付けつつ、リンク先は /for-shops に集約する。
 */

type Entry = {
  slug: string;
  badge: string;
  title: string;
  desc: string;
  href: string;
  comingSoon?: boolean;
};

const ENTRIES: Entry[] = [
  {
    slug: "coating",
    badge: "コーティング",
    title: "コーティング施工店",
    desc: "ボディ / ガラス / ホイールコーティングの保証 5年・10年管理を、証明書とマイページで完結。",
    href: "/for-shops",
  },
  {
    slug: "ppf",
    badge: "PPF",
    title: "PPF (ペイントプロテクションフィルム) 施工店",
    desc: "高単価施工こそ、写真エビデンスと改ざん不可な証明が信頼の決め手。査定・転売時にも効きます。",
    href: "/for-shops",
  },
  {
    slug: "body-repair",
    badge: "ボディリペア",
    title: "ボディリペア・板金",
    desc: "保険案件の連携・写真記録・代理店ネットワーク。電話/FAX 中心の運用を一気にデジタル化。",
    href: "/for-shops",
    comingSoon: true,
  },
  {
    slug: "maintenance",
    badge: "整備",
    title: "整備・車検工場",
    desc: "車両台帳・整備履歴・予約・請求まで一気通貫。中古車流通時の付加価値訴求も可能。",
    href: "/for-shops",
    comingSoon: true,
  },
  {
    slug: "agency",
    badge: "代理店",
    title: "代理店・ネットワーク本部",
    desc: "加盟店招待・成約報酬計算・電子署名同意。複数店舗オーナー向けのテナントツリーに対応。",
    href: "/for-agents",
  },
  {
    slug: "insurer",
    badge: "保険会社",
    title: "損保・自動車保険",
    desc: "施工内容を URL 1つで照会、CSV エクスポート、API 連携。査定リードタイムを短縮。",
    href: "/for-insurers",
  },
];

export function IndustryEntries() {
  return (
    <Section id="industry">
      <SectionHeading
        title="あなたの業態に最適化された使い方を。"
        subtitle="施工店・代理店・保険会社、それぞれの業務に合わせた導線をご用意しています。"
      />

      <div className="mx-auto max-w-6xl grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {ENTRIES.map((e, i) => (
          <ScrollReveal key={e.slug} variant="fade-up" delay={(i % 3) * 80}>
            <Link
              href={e.href}
              className="group block h-full rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6 hover:bg-white/[0.06] hover:border-white/[0.14] hover:-translate-y-0.5 transition-all"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center rounded-full border border-blue-500/20 bg-blue-500/10 px-2.5 py-0.5 text-[0.65rem] font-medium uppercase tracking-widest text-blue-300">
                  {e.badge}
                </span>
                {e.comingSoon && (
                  <span className="inline-flex items-center rounded-full border border-white/[0.1] bg-white/[0.04] px-2 py-0.5 text-[0.6rem] font-medium uppercase tracking-widest text-white/70">
                    Coming soon
                  </span>
                )}
              </div>
              <h3 className="mt-4 text-base font-bold text-white group-hover:text-blue-200 transition-colors leading-snug">
                {e.title}
              </h3>
              <p className="mt-3 text-xs leading-relaxed text-white/80">{e.desc}</p>
              <p className="mt-5 text-xs font-medium text-blue-300 group-hover:text-blue-200 transition-colors">
                詳しく見る &rarr;
              </p>
            </Link>
          </ScrollReveal>
        ))}
      </div>
    </Section>
  );
}
