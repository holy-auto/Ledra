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
  title: "保険会社ポータル",
  description:
    "証明書の真正性確認を数秒で。損保査定担当者が施工証明書を検索・照会・案件管理できる専用ポータルの技術仕様と機能詳細です。",
  alternates: { canonical: "/features/insurer-portal" },
};

const painPoints = [
  {
    title: "施工店への電話確認が必須",
    desc: "保険請求時に「本当に施工されたか」を確かめるため、査定担当者が施工店に直接電話する。施工店側も対応に追われ、双方にとって非効率な往復が生まれます。",
  },
  {
    title: "改ざんを検知する手段がない",
    desc: "PDFや写真は誰でも編集できます。施工店が誠実でも、保険会社側に「信じる手段」しかない状況では、査定の質に限界があります。",
  },
  {
    title: "案件情報が担当者の手元に散在",
    desc: "施工証明書の確認・メッセージ・対応メモが複数ツールに分散。担当者が変わるたびに引き継ぎが困難になり、繁忙期に対応が漏れます。",
  },
  {
    title: "監査対応で過去記録の再構成が必要",
    desc: "「誰がいつ何を閲覧したか」を後から再構成するには時間がかかる。コンプライアンス対応のたびに調査コストが発生します。",
  },
];

const verificationSteps = [
  {
    step: "1",
    title: "施工店から証明書URLを受領",
    desc: "施工店がLedraで発行したQRコード・URLを保険担当者に共有。メール・LINEに届いたURLをクリックするだけでポータルに入れます。",
  },
  {
    step: "2",
    title: "Public IDで検索・照会",
    desc: "証明書のPublic IDで一意に検索。施工内容・写真・施工店・日時を1画面で確認できます。",
  },
  {
    step: "3",
    title: "ブロックチェーン検証バッジを確認",
    desc: "Polygon anchoring による検証結果をバッジで表示。「このハッシュは発行時からブロックチェーン上に記録されている」ことをLedraのサーバに依存せず確認できます。",
  },
  {
    step: "4",
    title: "案件として登録・対応記録を残す",
    desc: "照会した証明書を案件として登録。担当者・対応ステータス・メッセージ・添付資料を案件に紐付けてチームで共有します。",
  },
];

const portalFeatures = [
  {
    title: "証明書の横断検索",
    description:
      "Public ID・顧客名・車台番号・ナンバー・施工種別・日付範囲で証明書を即検索。複数条件の組み合わせ絞り込みにも対応。",
  },
  {
    title: "Polygon 改ざん検知",
    description:
      "照会した証明書コンテンツのSHA-256ハッシュをPolygonで自動検証。改ざん検知バッジをリアルタイムに表示します。",
    href: "/features/blockchain-anchoring",
  },
  {
    title: "案件管理",
    description:
      "問い合わせ・査定・対応完了まで、証明書に紐付いた案件として一元管理。担当アサイン・SLA管理・テンプレート対応も可能です。",
  },
  {
    title: "ウォッチリスト",
    description: "気になる証明書・施工店をウォッチリストに登録。ステータス変更時に自動通知が届きます。",
  },
  {
    title: "操作ログ・監査証跡",
    description: "誰がいつ何を照会・操作したかを完全記録。コンプライアンス・内部監査への即時対応が可能です。",
  },
  {
    title: "API連携",
    description:
      "既存の損害サービスシステム・基幹システムとAPI連携可能。証明書の照会・ステータス取得をバッチ処理で自動化できます。",
  },
  {
    title: "ロール管理",
    description: "Owner / Admin / Adjuster / Viewer の4段階。チームの規模・組織に合わせたアクセス権限設定ができます。",
  },
  {
    title: "分析レポート",
    description: "施工店別・施工種別・月次の証明書照会統計。査定業務のパターン分析に活用できます。",
  },
];

const techSpecs = [
  {
    label: "アンカリング方式",
    value: "Polygon PoS — SHA-256 ハッシュのみをオンチェーンに記録",
  },
  {
    label: "独立検証",
    value: "Polygonscan 等の外部エクスプローラーからも確認可能。Ledraなしで検証できます",
  },
  {
    label: "写真署名",
    value: "C2PA 1.3 規格によるコンテンツクレデンシャル埋め込み",
  },
  {
    label: "データ保存",
    value: "Supabase PostgreSQL（RLS有効）+ AES-256 ディスク暗号化",
  },
  {
    label: "通信",
    value: "TLS 1.3 全トラフィック暗号化 / HSTS 強制",
  },
  {
    label: "アクセス制御",
    value: "テナント・役割・所有者の3軸でSQLレベルのアクセス制限（RLS）",
  },
];

export default function InsurerPortalPage() {
  return (
    <>
      <Breadcrumbs
        items={[
          { name: "機能", url: "/features" },
          { name: "保険会社ポータル", url: "/features/insurer-portal" },
        ]}
      />
      <PageHero
        badge="FEATURE › 保険会社ポータル"
        title="施工証明の確認を、数秒に。"
        subtitle="施工店から共有されたQRコードを読むだけで、証明書の内容とブロックチェーン検証結果が即表示。電話確認ゼロ、改ざん検知付きで、損保査定を根本から変えます。"
      />

      {/* Pain points */}
      <Section bg="alt">
        <SectionHeading
          title="査定現場が抱えるコスト"
          subtitle="施工証明の確認と案件追跡に、本来不要な時間が積み重なっています。"
        />
        <FeatureGrid className="mt-10">
          {painPoints.map((p, i) => (
            <FeatureCard key={p.title} variant="bordered" title={p.title} description={p.desc} delay={i * 70} />
          ))}
        </FeatureGrid>
      </Section>

      {/* Verification flow */}
      <Section>
        <SectionHeading title="証明書の確認フロー" subtitle="URL受領から検証完了まで、1分かかりません。" />
        <div className="mx-auto mt-10 max-w-3xl space-y-4">
          {verificationSteps.map((s, i) => (
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

      {/* Portal features */}
      <Section bg="alt" id="features">
        <SectionHeading
          title="保険会社ポータルの機能"
          subtitle="証明書の照会・案件管理・監査・API連携まで、ひとつのポータルに揃えています。"
        />
        <FeatureGrid className="mt-10">
          {portalFeatures.map((f, i) => (
            <FeatureCard key={f.title} title={f.title} description={f.description} delay={i * 40} href={f.href} />
          ))}
        </FeatureGrid>
      </Section>

      {/* Technical specifications */}
      <Section>
        <SectionHeading title="技術仕様" subtitle="信頼の根拠を、具体的な技術で示します。" />
        <ScrollReveal variant="fade-up">
          <div className="mx-auto mt-10 max-w-3xl overflow-hidden rounded-2xl border border-white/[0.08]">
            {techSpecs.map((spec, i) => (
              <div
                key={spec.label}
                className={`flex flex-col sm:flex-row sm:items-start gap-2 sm:gap-6 px-6 py-4 ${
                  i % 2 === 0 ? "bg-white/[0.03]" : "bg-white/[0.015]"
                } ${i < techSpecs.length - 1 ? "border-b border-white/[0.05]" : ""}`}
              >
                <p className="w-40 shrink-0 text-xs font-semibold text-white pt-0.5">{spec.label}</p>
                <p className="text-sm leading-relaxed text-white">{spec.value}</p>
              </div>
            ))}
          </div>
        </ScrollReveal>
        <div className="mt-8 text-center">
          <a
            href="/features/blockchain-anchoring"
            className="inline-flex items-center gap-2 text-sm text-blue-300 hover:text-blue-200 transition-colors"
          >
            改ざん検知の仕組みを詳しく見る →
          </a>
        </div>
      </Section>

      {/* Before/After */}
      <Section bg="alt">
        <SectionHeading title="導入前後の変化" subtitle="保険会社の査定業務が、どう変わるか。" />
        <div className="mx-auto mt-10 max-w-3xl space-y-4">
          {[
            { before: "施工店への電話・FAX確認", after: "Public ID 検索で数秒で照会" },
            { before: "PDFの改ざん検知不可", after: "Polygon anchoring で独立検証" },
            { before: "担当者個人のメールに案件情報が散在", after: "案件管理でチーム全員が同じ情報を共有" },
            { before: "監査対応のたびにログを掘り起こし", after: "操作ログを常時記録、即エクスポート" },
          ].map((row, i) => (
            <ScrollReveal key={row.before} variant="fade-up" delay={i * 50}>
              <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] items-center gap-5 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5 md:p-6">
                <div>
                  <p className="text-[0.688rem] uppercase tracking-wider text-white">Before</p>
                  <p className="mt-1.5 text-[0.938rem] text-white leading-relaxed">{row.before}</p>
                </div>
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="hidden md:block w-5 h-5 text-blue-300 shrink-0"
                >
                  <path d="M5 12h14M13 5l7 7-7 7" />
                </svg>
                <div>
                  <p className="text-[0.688rem] uppercase tracking-wider text-blue-300">After</p>
                  <p className="mt-1.5 text-[0.938rem] font-medium text-white leading-relaxed">{row.after}</p>
                </div>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </Section>

      {/* FAQ */}
      <Section>
        <SectionHeading title="よくあるご質問" />
        <FAQList>
          <FAQItem
            question="既存の損害サービスシステムを置き換える必要がありますか？"
            answer="いいえ。Ledra は施工側の事実を確実に届ける証明インフラとして位置づけており、既存の損害サービスシステムの代替ではありません。API連携またはブラウザから既存業務に組み込んでいただけます。"
          />
          <FAQItem
            question="施工店がLedraを使っていなければ機能しませんか？"
            answer="はい、施工店側がLedraで証明書を発行していることが前提です。Ledraは施工店・保険会社の双方が使うことで価値が立ち上がるプラットフォームです。施工店への普及活動は当社で並行して進めています。"
          />
          <FAQItem
            question="複数の担当者で同じ証明書を照会できますか？"
            answer="はい。テナント内の全Adjusterが同じ証明書にアクセスできます。ロール設定で閲覧・操作の範囲を制御でき、誰がいつ照会したかも操作ログに記録されます。"
          />
          <FAQItem
            question="APIで照会を自動化できますか？"
            answer="はい。Pro以上のプランでREST APIが利用可能です。証明書のステータス取得・ハッシュ検証結果の取得・案件一覧の取得などをシステム連携で自動化できます。詳細はAPI仕様書をご請求ください。"
          />
        </FAQList>
      </Section>

      <CTABanner
        title="証明書の真正性確認を、業務の標準に。"
        subtitle="先行導入企業様には無償の API・基幹連携実装支援を提供しています。"
        primaryLabel="パイロット参加を申し込む"
        primaryHref="/contact?role=insurer"
        secondaryLabel="技術ホワイトペーパー"
        secondaryHref="/resources"
        trackLocation="insurer-portal-cta"
      />
    </>
  );
}
