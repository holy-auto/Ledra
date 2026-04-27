import { PageHero } from "@/components/marketing/PageHero";
import { Section } from "@/components/marketing/Section";
import { SectionHeading } from "@/components/marketing/SectionHeading";
import { ROICalculator } from "@/components/marketing/ROICalculator";
import { CTABanner } from "@/components/marketing/CTABanner";

export const metadata = {
  title: "ROIシミュレーター",
  description:
    "月間の施工証明書発行数・事務時間・再発行コストから、Ledra 導入時の年間削減効果を試算いただけます。",
  alternates: { canonical: "/roi" },
};

export default function ROIPage() {
  return (
    <>
      <PageHero
        badge="ROI"
        title="数字で見る、Ledra の効果"
        subtitle="現状の業務数値を入力いただくと、Ledra 導入時の年間削減効果を推定します。数分で、経営判断の最初の材料がそろいます。"
      />

      <Section>
        <ROICalculator />
        <p className="mt-10 text-center text-xs text-white/75 leading-relaxed max-w-2xl mx-auto">
          ※ 本シミュレーターは、他社事例の平均値に基づく推定値を表示するものです。
          <br />
          実際の効果は、貴社の業務フロー・既存システム・従業員数により変動します。
          <br />
          個別ヒアリングに基づいた詳細試算も、無料でご提供可能です。
        </p>
      </Section>

      <Section bg="alt">
        <SectionHeading
          title="なぜ、これだけ削減できるのか"
          subtitle="Ledra が解消する3つのロスを、そのまま金額に置き換えています。"
        />
        <div className="mx-auto max-w-3xl grid grid-cols-1 md:grid-cols-3 gap-5 mt-10">
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6">
            <p className="text-xs font-medium uppercase tracking-wider text-blue-300">01</p>
            <h3 className="mt-3 text-base font-bold text-white">事務時間のロス</h3>
            <p className="mt-3 text-sm leading-relaxed text-white/80">
              紙・Excel での書類作成、郵送、保管、検索。
              Ledra は発行から送付までを1タップにまとめ、1件あたりの事務時間を大幅に削減します。
            </p>
          </div>
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6">
            <p className="text-xs font-medium uppercase tracking-wider text-blue-300">02</p>
            <h3 className="mt-3 text-base font-bold text-white">再発行のロス</h3>
            <p className="mt-3 text-sm leading-relaxed text-white/80">
              書類の紛失・問合せ対応・再発行の手間。
              デジタル証明書は顧客ポータルから常時閲覧・再取得できるため、再発行業務が大きく減ります。
            </p>
          </div>
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6">
            <p className="text-xs font-medium uppercase tracking-wider text-blue-300">03</p>
            <h3 className="mt-3 text-base font-bold text-white">信頼のロス</h3>
            <p className="mt-3 text-sm leading-relaxed text-white/80">
              改ざん疑念による査定・精算の遅延。
              ブロックチェーンアンカリング付き証明書は、金額換算しづらいロスを根本から解消します。
            </p>
          </div>
        </div>
      </Section>

      <CTABanner
        title="個別ヒアリングでの詳細試算も承ります"
        subtitle="業務フロー・従業員構成・既存システム連携まで考慮した、御社専用の試算書を無料で作成いたします。"
        primaryLabel="お問い合わせ"
        primaryHref="/contact"
        secondaryLabel="資料ダウンロード"
        secondaryHref="/resources"
      />
    </>
  );
}
