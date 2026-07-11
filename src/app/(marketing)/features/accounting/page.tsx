import { PageHero } from "@/components/marketing/PageHero";
import { Breadcrumbs } from "@/components/marketing/Breadcrumbs";
import { Section } from "@/components/marketing/Section";
import { SectionHeading } from "@/components/marketing/SectionHeading";
import { FeatureGrid } from "@/components/marketing/FeatureGrid";
import { FeatureCard } from "@/components/marketing/FeatureCard";
import { FAQList } from "@/components/marketing/FAQList";
import { FAQItem } from "@/components/marketing/FAQItem";
import { CTABanner } from "@/components/marketing/CTABanner";
import { ScrollReveal } from "@/components/marketing/ScrollReveal";

export const metadata = {
  title: "会計連携（freee / マネーフォワード）",
  description:
    "入金済みの請求書を freee 会計・マネーフォワード クラウドへ自動で仕訳連携。OAuth 接続・勘定科目/税率マッピング・日次自動同期で、二重入力と転記ミスをなくします。",
  alternates: { canonical: "/features/accounting" },
};

const problems = [
  {
    title: "請求と会計の二重入力",
    desc: "Ledra で発行した請求書を、会計ソフトにもう一度手で打ち直す。件数が増えるほど、月末の入力作業が積み上がります。",
  },
  {
    title: "転記ミスと突合の手間",
    desc: "金額・税率・勘定科目の打ち間違いは、決算前の突合作業で見つかると探すのに時間がかかります。入力者が変わるほど精度はばらつきます。",
  },
  {
    title: "入金状況と仕訳がずれる",
    desc: "「入金済みなのに会計側は未計上」。売上の計上タイミングが手作業に依存すると、月次のキャッシュフローが正確に見えません。",
  },
];

const flowSteps = [
  {
    step: "1",
    title: "会計ソフトと OAuth 連携",
    desc: "`/admin/accounting` から freee 会計またはマネーフォワード クラウドのアカウントを OAuth で接続。state 検証付きの安全なフローで、トークンは暗号化して保管します。パスワードを Ledra に預ける必要はありません。",
  },
  {
    step: "2",
    title: "勘定科目・税率をマッピング",
    desc: "デフォルトの売上勘定科目・税率を一度設定するだけ。以降の仕訳はこのマッピングに沿って組み立てられるため、毎回の判断が不要になります。",
  },
  {
    step: "3",
    title: "入金済み請求書を自動で仕訳化",
    desc: "日次で動くバックグラウンド同期が、Ledra の入金済み請求書を会計ソフトの売上仕訳として連携します。発行・入金のたびに手で打ち直す必要はありません。",
  },
  {
    step: "4",
    title: "連携状況をダッシュボードで確認",
    desc: "未連携 → 認可待ち → 連携中 → 再認可必要、の連携ステータスと、直近30日の同期成功/失敗件数を一画面で確認。失敗した分だけ再同期できます。",
  },
];

const capabilityCards = [
  {
    title: "freee 会計 / マネーフォワード クラウドに対応",
    description:
      "国内シェアの高い2つのクラウド会計に対応。すでに使っている会計ソフトをそのままに、Ledra 側の売上だけを自動で流し込めます。",
  },
  {
    title: "入金トリガーで売上計上",
    description:
      "仕訳化の起点は「入金済み」。請求書のライフサイクルと会計の計上タイミングが揃うため、月次の売上・キャッシュフローが実態に近づきます。",
  },
  {
    title: "デフォルト科目・税率の集中管理",
    description:
      "売上勘定・税率は管理画面で一元設定。軽減税率や非課税の扱いも、毎回の入力ではなく設定として持てるので、担当者が変わってもブレません。",
  },
  {
    title: "自動同期 ON / OFF と再同期",
    description:
      "自動同期はテナント単位で切り替え可能。一時的に止めたい時期は OFF にし、失敗した仕訳だけを後からまとめて再同期できます。",
  },
];

export default function AccountingPage() {
  return (
    <>
      <Breadcrumbs
        items={[
          { name: "機能", url: "/features" },
          { name: "会計連携", url: "/features/accounting" },
        ]}
      />
      <PageHero
        badge="FEATURE › 会計連携"
        title="請求のあとの「もう一回入力」を、なくす。"
        subtitle="入金済みの請求書を freee 会計・マネーフォワード クラウドへ自動で仕訳連携。OAuth 接続と勘定科目マッピングを一度整えるだけで、日次の同期に任せられます。"
      />

      {/* Problems */}
      <Section bg="alt">
        <SectionHeading
          title="会計まわりの「二度手間」"
          subtitle="売上が増えるほど、請求と会計のあいだの手作業が重くなります。"
        />
        <FeatureGrid className="mt-10">
          {problems.map((p, i) => (
            <FeatureCard key={p.title} variant="bordered" title={p.title} description={p.desc} delay={i * 70} />
          ))}
        </FeatureGrid>
      </Section>

      {/* Flow */}
      <Section>
        <SectionHeading
          title="接続から自動同期まで"
          subtitle="設定は最初の一度だけ。あとは日次の同期がまわり続けます。"
        />
        <div className="mx-auto mt-10 max-w-3xl space-y-4">
          {flowSteps.map((s, i) => (
            <ScrollReveal key={s.step} variant="fade-up" delay={i * 60}>
              <div className="flex items-start gap-5 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6 md:p-7">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500/20 to-blue-500/10 text-sm font-bold text-blue-300 border border-blue-500/20">
                  {s.step}
                </div>
                <div>
                  <h3 className="text-[1.063rem] font-bold text-white leading-snug">{s.title}</h3>
                  <p className="mt-2 text-[0.938rem] leading-[1.85] text-white">{s.desc}</p>
                </div>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </Section>

      {/* Capabilities */}
      <Section bg="alt">
        <SectionHeading
          title="連携でできること"
          subtitle="既存の会計フローを置き換えず、売上仕訳だけを自動化します。"
        />
        <FeatureGrid className="mt-10">
          {capabilityCards.map((c, i) => (
            <FeatureCard key={c.title} title={c.title} description={c.description} delay={i * 50} />
          ))}
        </FeatureGrid>
      </Section>

      {/* Before/After numbers */}
      <Section>
        <SectionHeading
          title="月末の入力を、どれだけ減らせるか"
          subtitle="件数が増えるほど、自動化の効果は積み上がります。"
        />
        <div className="mx-auto mt-10 max-w-3xl grid grid-cols-1 sm:grid-cols-3 gap-5">
          {[
            { label: "請求の会計入力", before: "1件ずつ手入力", after: "自動で仕訳連携", unit: "入金済みを起点に同期" },
            {
              label: "科目・税率の判断",
              before: "毎回その場で",
              after: "設定として固定",
              unit: "担当者が変わってもブレない",
            },
            { label: "同期の頻度", before: "気づいた時に手作業", after: "日次で自動", unit: "失敗分だけ再同期" },
          ].map((item) => (
            <ScrollReveal key={item.label} variant="fade-up">
              <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6">
                <p className="text-[0.75rem] font-semibold uppercase tracking-wider text-white">{item.label}</p>
                <p className="mt-3 text-sm text-white line-through">{item.before}</p>
                <p className="mt-1 text-2xl font-bold text-blue-300">{item.after}</p>
                <p className="mt-1 text-[0.688rem] text-white">{item.unit}</p>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </Section>

      {/* FAQ */}
      <Section bg="alt">
        <SectionHeading title="よくあるご質問" />
        <FAQList>
          <FAQItem
            question="freee とマネーフォワード、両方に対応していますか？"
            answer="はい。freee 会計・マネーフォワード クラウドのどちらにも対応しています。お使いの会計ソフトを OAuth で接続してください（同時接続ではなく、利用中のサービスを選んで連携します）。"
          />
          <FAQItem
            question="会計ソフトのパスワードを Ledra に預ける必要はありますか？"
            answer="いいえ。接続は OAuth 方式で行うため、Ledra がパスワードを保持することはありません。発行されたアクセストークンは暗号化して保管し、必要に応じて再認可できます。"
          />
          <FAQItem
            question="どのタイミングで仕訳が作られますか？"
            answer="請求書が「入金済み」になったものを対象に、日次の自動同期が売上仕訳として会計ソフトへ連携します。下書きや未入金の請求書は対象になりません。"
          />
          <FAQItem
            question="勘定科目や税率は自由に設定できますか？"
            answer="デフォルトの売上勘定科目・税率を管理画面（/admin/accounting）で設定できます。設定した内容に沿って仕訳が組み立てられます。"
          />
          <FAQItem
            question="連携が失敗したらどうなりますか？"
            answer="連携ステータスと直近30日の成功/失敗件数をダッシュボードで確認できます。失敗した分は原因（再認可が必要など）を確認のうえ、再同期できます。"
          />
        </FAQList>
      </Section>

      <CTABanner
        title="請求から会計まで、入力は一度だけ。"
        subtitle="Ledra で発行した請求を、使っている会計ソフトへ自動で。まずは無料で試せます。"
        primaryLabel="無料で試す"
        primaryHref="/signup"
        secondaryLabel="機能一覧に戻る"
        secondaryHref="/features#integration"
        trackLocation="accounting-cta"
      />
    </>
  );
}
