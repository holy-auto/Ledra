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
import { PolygonAnchoringDiagram } from "@/components/marketing/diagrams/PolygonAnchoringDiagram";

export const metadata = {
  title: "改ざん検知・ブロックチェーンアンカリング",
  description:
    "C2PA写真署名とPolygonブロックチェーンによる3層の改ざん検知。施工証明書の真正性を、Ledra以外の第三者でも独立検証できる仕組みです。",
  alternates: { canonical: "/features/blockchain-anchoring" },
};

const problems = [
  {
    title: "デジタルファイルは簡単に差し替えられる",
    desc: "PDFも写真もファイルである以上、後から編集・差し替えができます。「これは本当に施工当日に撮った写真ですか？」という疑問に、従来の証明書は答えられません。",
  },
  {
    title: "サーバーを信頼するしかない",
    desc: "クラウドで管理しているということは、運営者がデータを書き換えられる立場にあるということ。保険会社や顧客が「本当にそのままか」を確かめる手段がありませんでした。",
  },
  {
    title: "監査のたびに人手が必要になる",
    desc: "証明書の真正性確認を人が目視で行うと、スケールしません。大量の案件を扱う損保の査定では、自動検証できる仕組みが必要です。",
  },
];

const layers = [
  {
    number: "01",
    title: "C2PA写真署名",
    tech: "C2PA 1.3",
    desc: "撮影した写真を証明書と紐付け、C2PA（Coalition for Content Provenance and Authenticity）規格でメタデータに署名を埋め込みます。写真ファイルが後から差し替えられると署名検証が失敗します。",
    color: "rgba(96,165,250,",
  },
  {
    number: "02",
    title: "SHA-256コンテンツハッシュ",
    tech: "SHA-256 (NIST)",
    desc: "証明書の全コンテンツ（施工内容・写真・日時・施工者）をまとめてSHA-256ハッシュ化します。1文字でも変わればハッシュは完全に別の値になります。",
    color: "rgba(139,200,255,",
  },
  {
    number: "03",
    title: "Polygonへのアンカリング",
    tech: "Polygon PoS",
    desc: "ハッシュをPolygonブロックチェーンのトランザクションとして刻印します。一度書き込まれたブロックは過去に遡って書き換えることが技術的に不可能です。",
    color: "rgba(167,139,250,",
  },
];

const auditSteps = [
  {
    step: "1",
    title: "保険会社が証明書を受領",
    desc: "施工店がQRコードまたはURLで保険会社に証明書を共有。保険会社のポータルまたはパブリック検証ページからアクセスします。",
  },
  {
    step: "2",
    title: "Ledraがハッシュを再計算",
    desc: "現在のデータベース上の証明書コンテンツからSHA-256ハッシュをリアルタイムに再計算します。",
  },
  {
    step: "3",
    title: "Polygonへ問い合わせ",
    desc: "アンカリング時に記録したトランザクションハッシュをPolygonネットワークに照会。ブロック番号・タイムスタンプとともに登録済みハッシュを取得します。",
  },
  {
    step: "4",
    title: "一致判定 → 真正確認",
    desc: "現在のハッシュとブロックチェーン上のハッシュが一致すれば「発行時から内容が変更されていない」と判定。査定担当者の画面に検証バッジを表示します。",
  },
];

const techCards = [
  {
    title: "NFTは使用しない",
    description:
      "証明書をNFT化する設計ではありません。ハッシュのみをチェーンに刻印するため、ガスコストを最小化し、実運用に耐えるコストで動作します。",
  },
  {
    title: "写真の中身はチェーンに載らない",
    description:
      "アンカリングするのはSHA-256ハッシュ（64文字の文字列）のみ。写真・個人情報・施工内容は一切ブロックチェーンに書き込まれません。",
  },
  {
    title: "既存証明書も順次アンカリング",
    description:
      "バックフィル機能により、導入以前に発行された証明書もQStashキュー経由で順次アンカリングします。大量件数でも非同期で処理されます。",
  },
  {
    title: "Ledraなしでも検証可能",
    description:
      "PolygonはパブリックなブロックチェーンのためPolygonscan等の外部エクスプローラーからも誰でも確認できます。Ledraが存在しなくなっても記録は残ります。",
  },
];

export default function BlockchainAnchoringPage() {
  return (
    <>
      <Breadcrumbs
        items={[
          { name: "機能", url: "/features" },
          { name: "ブロックチェーン・アンカリング", url: "/features/blockchain-anchoring" },
        ]}
      />
      <PageHero
        badge="FEATURE › 改ざん検知"
        title="施工写真を、世界が証明する。"
        subtitle="C2PA写真署名・SHA-256ハッシュ・Polygonブロックチェーンによる3層構造。施工証明書の真正性を、Ledra以外の第三者が独立して検証できます。"
      />

      {/* Problem */}
      <Section bg="alt">
        <SectionHeading
          title="「本当にそのままですか？」に答えられない"
          subtitle="デジタル証明書が増えるほど、真正性の担保が問われるようになっています。"
        />
        <FeatureGrid className="mt-10">
          {problems.map((p, i) => (
            <FeatureCard key={p.title} variant="bordered" title={p.title} description={p.desc} delay={i * 70} />
          ))}
        </FeatureGrid>
      </Section>

      {/* 3-layer solution */}
      <Section>
        <SectionHeading
          title="3層の改ざん検知構造"
          subtitle="写真・コンテンツ・ブロックチェーンの3つをまとめて守ります。"
        />
        <div className="mx-auto mt-10 max-w-3xl space-y-5">
          {layers.map((l, i) => (
            <ScrollReveal key={l.number} variant="fade-up" delay={i * 80}>
              <div className="flex items-start gap-6 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6 md:p-8">
                <div
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white border"
                  style={{
                    background: `${l.color}0.18)`,
                    borderColor: `${l.color}0.4)`,
                  }}
                >
                  {l.number}
                </div>
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-3 mb-2">
                    <h3 className="text-[1.063rem] font-bold text-white">{l.title}</h3>
                    <span
                      className="px-2.5 py-0.5 rounded-full text-[0.688rem] font-mono font-medium border"
                      style={{
                        color: `${l.color}0.9)`,
                        borderColor: `${l.color}0.3)`,
                        background: `${l.color}0.08)`,
                      }}
                    >
                      {l.tech}
                    </span>
                  </div>
                  <p className="text-[0.938rem] leading-[1.8] text-white">{l.desc}</p>
                </div>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </Section>

      {/* Diagram */}
      <Section bg="alt">
        <SectionHeading
          title="発行から検証までのフロー"
          subtitle="施工店が証明書を発行した瞬間から、保険会社が独立に検証するまで。"
        />
        <ScrollReveal variant="fade-up">
          <div className="mx-auto mt-8 max-w-4xl rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4 md:p-8">
            <PolygonAnchoringDiagram className="w-full h-auto" />
          </div>
        </ScrollReveal>
      </Section>

      {/* Audit scenario */}
      <Section>
        <SectionHeading
          title="保険会社の査定シナリオ"
          subtitle="損保の査定担当者が、施工証明書の真正性を確認する流れです。"
        />
        <div className="mx-auto mt-10 max-w-3xl space-y-4">
          {auditSteps.map((s, i) => (
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

      {/* Tech cards */}
      <Section bg="alt">
        <SectionHeading title="設計上のポイント" subtitle="実運用を想定した技術的な判断について。" />
        <FeatureGrid className="mt-10">
          {techCards.map((c, i) => (
            <FeatureCard key={c.title} title={c.title} description={c.description} delay={i * 50} />
          ))}
        </FeatureGrid>
      </Section>

      {/* FAQ */}
      <Section>
        <SectionHeading title="よくあるご質問" />
        <FAQList>
          <FAQItem
            question="ブロックチェーンと聞くと投機・NFTを連想しますが、大丈夫ですか？"
            answer="Ledraが使うのはPolygonのトランザクション機能のみで、NFTや暗号資産の売買とは無関係です。記録の改ざん不可能性という特性だけを利用しており、導入店舗が暗号資産を持つ必要はありません。"
          />
          <FAQItem
            question="アンカリングの費用はかかりますか？"
            answer="Polygonのガス代（1件あたり数円程度）はLedraが負担します。利用店舗の追加コストはありません。"
          />
          <FAQItem
            question="写真や個人情報がブロックチェーンに公開されるのでは？"
            answer="ブロックチェーンに書き込まれるのはSHA-256ハッシュ（64文字の文字列）のみです。写真・施工内容・顧客情報は一切チェーンには載りません。ハッシュから元データを復元することは計算上不可能です。"
          />
          <FAQItem
            question="Ledraのサービスが終了しても証明書の真正性は証明できますか？"
            answer="PolygonはLedraが管理しているわけではないパブリックなブロックチェーンです。Polygonscanなどの外部ツールでもハッシュの存在を確認できるため、Ledra自体がなくなっても記録は残ります。"
          />
          <FAQItem
            question="アンカリングまでのタイムラグはありますか？"
            answer="証明書発行後、QStashの非同期キュー経由でPolygnへ送信されます。通常1〜2分以内に確定しますが、ネットワーク輻輳時は数分かかる場合があります。"
          />
        </FAQList>
      </Section>

      <CTABanner
        title="施工の記録を、第三者が証明できる資産に。"
        subtitle="改ざん検知付きの施工証明書を、今日から発行できます。"
        primaryLabel="無料で試す"
        primaryHref="/signup"
        secondaryLabel="機能一覧に戻る"
        secondaryHref="/features#certificate"
        trackLocation="blockchain-anchoring-cta"
      />
    </>
  );
}
