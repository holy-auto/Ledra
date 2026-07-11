import { PageHero } from "@/components/marketing/PageHero";
import { Breadcrumbs } from "@/components/marketing/Breadcrumbs";
import { Section } from "@/components/marketing/Section";
import { SectionHeading } from "@/components/marketing/SectionHeading";
import { ScrollReveal } from "@/components/marketing/ScrollReveal";
import { FeatureCard } from "@/components/marketing/FeatureCard";
import { CTABanner } from "@/components/marketing/CTABanner";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "正直な比較 ── Ledra に向いていない方・紙やExcelとの比較",
  description:
    "Ledra に向いていない方を先にお伝えします。紙の保証書 + Excel、汎用CRMとの正直な比較表つき。自社が負けている項目も隠さず載せる、施工証明SaaSの比較検討ページ。",
  alternates: { canonical: "/honest-comparison" },
  openGraph: {
    title: "正直な比較 | Ledra",
    description: "Ledra に向いていない方を先にお伝えします。負けている項目も隠さない比較表。",
    url: "/honest-comparison",
    siteName: "Ledra",
    locale: "ja_JP",
    type: "website",
  },
};

/** 向いていない方 — 先に出す。ここで帰っていただくのも誠実な導線。 */
const notForYou = [
  {
    title: "紙の保証書で、いま何も困っていない方",
    body: "お客様からの問い合わせも保険会社とのやり取りも紙で回っているなら、急いで変える必要はありません。困り事が出てきたときに思い出してください。",
  },
  {
    title: "施工の記録を残す運用を、変えるつもりがない方",
    body: "Ledra は「発行して終わり」の道具ではなく、施工のたびに記録を残す運用とセットで価値が出ます。運用を変えないまま導入しても、月額の分だけ損をします。",
  },
  {
    title: "インターネットのない環境だけで完結したい方",
    body: "Ledra はWebサービスです。電波の届かない環境での完全オフライン運用には向きません。",
  },
  {
    title: "導入実績の多い老舗ツールだけを選びたい方",
    body: "Ledra はまだ若いサービスで、導入社数は正直に言って多くありません。実数は透明性ダッシュボードで公開しています。それでも一緒に作ってくれる方と組みたい、というのが本音です。",
  },
];

type Mark = "◎" | "○" | "△" | "×";
const markColor: Record<Mark, string> = {
  "◎": "text-emerald-300",
  "○": "text-blue-300",
  "△": "text-amber-300",
  "×": "text-red-300",
};

/** 比較表 — Ledra が負ける行（導入コスト・オフライン・実績）も削らない。 */
const rows: { label: string; paper: [Mark, string]; crm: [Mark, string]; ledra: [Mark, string] }[] = [
  {
    label: "導入コスト・手間",
    paper: ["◎", "ゼロ。今日から使える"],
    crm: ["△", "設定・カスタマイズが必要"],
    ledra: ["○", "無料プランあり・初期設定 約5分"],
  },
  {
    label: "改ざん耐性・真正性の証明",
    paper: ["×", "紛失・偽造・書き換えを防げない"],
    crm: ["△", "社内データ。第三者は検証できない"],
    ledra: ["◎", "ブロックチェーン記録。第三者が独立に検証可能"],
  },
  {
    label: "保険会社・買い手への共有",
    paper: ["×", "原本の郵送・持参"],
    crm: ["△", "スクリーンショットやCSVの手作業"],
    ledra: ["◎", "URL・QRで即共有。閲覧に登録不要"],
  },
  {
    label: "施工業務への適合",
    paper: ["○", "自由に書ける"],
    crm: ["△", "汎用設計。施工の項目は自作"],
    ledra: ["◎", "車両・施工・保証に特化した設計"],
  },
  {
    label: "オフライン利用",
    paper: ["◎", "電波不要"],
    crm: ["△", "製品による"],
    ledra: ["×", "インターネット接続が必要"],
  },
  {
    label: "導入実績の多さ",
    paper: ["◎", "業界の現状そのもの"],
    crm: ["○", "汎用ツールとして豊富"],
    ledra: ["△", "少ない（実数を公開中）"],
  },
];

export default function HonestComparisonPage() {
  return (
    <>
      <Breadcrumbs items={[{ name: "正直な比較", url: "/honest-comparison" }]} />
      <PageHero
        badge="HONEST COMPARISON"
        title="先に、向いていない方をお伝えします。"
        subtitle="Ledra は「履歴に嘘をつかせない」サービスです。だから自社の売り込みにも嘘をつきません。合わない方に売らないことも、信頼の一部だと考えています。"
      />

      <Section>
        <SectionHeading title="Ledra に向いていない方" />
        <div className="mx-auto grid max-w-4xl grid-cols-1 gap-6 md:grid-cols-2">
          {notForYou.map((item, i) => (
            <FeatureCard
              key={item.title}
              variant="bordered"
              delay={i * 80}
              title={item.title}
              description={item.body}
            />
          ))}
        </div>
        <ScrollReveal variant="fade-in" delay={300}>
          <p className="mt-8 text-center text-sm text-white/80">
            導入社数・発行件数の実数は
            <Link href="/financial-transparency" className="mx-1 text-blue-400 hover:underline">
              透明性ダッシュボード
            </Link>
            で公開しています。
          </p>
        </ScrollReveal>
      </Section>

      <Section bg="alt">
        <SectionHeading
          title="紙・Excel・汎用CRMとの正直な比較"
          subtitle="Ledra が負けている行も、そのまま載せています。"
        />
        <ScrollReveal variant="fade-up">
          <div className="mx-auto max-w-5xl overflow-x-auto rounded-2xl border border-white/[0.08]">
            <table className="w-full min-w-[720px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-white/[0.08] bg-white/[0.03] text-xs uppercase tracking-wider text-white/80">
                  <th className="px-5 py-4 font-medium">比較項目</th>
                  <th className="px-5 py-4 font-medium">紙の保証書 + Excel</th>
                  <th className="px-5 py-4 font-medium">汎用CRM・顧客管理</th>
                  <th className="px-5 py-4 font-medium text-blue-300">Ledra</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.label} className="border-b border-white/[0.06] last:border-b-0">
                    <th scope="row" className="px-5 py-4 align-top font-medium text-white">
                      {row.label}
                    </th>
                    {([row.paper, row.crm, row.ledra] as const).map(([mark, note], i) => (
                      <td key={i} className="px-5 py-4 align-top">
                        <span className={`text-base font-bold ${markColor[mark]}`}>{mark}</span>
                        <span className="ml-2 text-white/85">{note}</span>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ScrollReveal>
        <ScrollReveal variant="fade-in" delay={150}>
          <p className="mx-auto mt-6 max-w-3xl text-center text-xs leading-relaxed text-white/70">
            評価は自社によるものです。「◎ 強い / ○ 十分 / △ 工夫か妥協が必要 / × 不向き」。
            誤りに気づかれた方は、遠慮なくご指摘ください。事実に基づいて直します。
          </p>
        </ScrollReveal>
      </Section>

      <Section>
        <SectionHeading title="それでも Ledra を選ぶ理由" />
        <div className="mx-auto max-w-3xl space-y-5 text-sm md:text-base leading-relaxed text-white/90">
          <ScrollReveal variant="fade-up">
            <p>
              上の表のとおり、「手軽さ」だけなら紙に勝てません。Ledra が選ばれるのは、
              <strong className="text-white">証明が第三者に対して効く</strong>からです。
              保険査定・中古車売買・お客様への説明——「うちはちゃんとやっている」を、口ではなくデータで示せます。
            </p>
          </ScrollReveal>
          <ScrollReveal variant="fade-up" delay={100}>
            <p>
              まずは無料プランで、実際の証明書を発行して手触りを確かめてください。合わなければ、そのままやめられます（クレジットカード登録も不要です）。
            </p>
          </ScrollReveal>
        </div>
      </Section>

      <CTABanner
        title="合うかどうか、実物で確かめてください。"
        subtitle="無料プランで実際に発行できます。合わなければやめられます。"
        primaryLabel="無料で試す"
        primaryHref="/signup"
        secondaryLabel="料金を見る"
        secondaryHref="/pricing"
        trackLocation="honest-comparison-final"
      />
    </>
  );
}
