import { PageHero } from "@/components/marketing/PageHero";
import { Section } from "@/components/marketing/Section";
import { SectionHeading } from "@/components/marketing/SectionHeading";
import { FeatureGrid } from "@/components/marketing/FeatureGrid";
import { FeatureCard } from "@/components/marketing/FeatureCard";
import { ScrollReveal } from "@/components/marketing/ScrollReveal";
import { CTABanner } from "@/components/marketing/CTABanner";
import Link from "next/link";

export const metadata = {
  title: "施工店の方へ",
  description: "CARTRUSTで施工証明書の作成・管理を効率化。顧客満足度と保険会社との連携を同時に向上させます。",
};

export default function ForShopsPage() {
  return (
    <>
      <PageHero
        badge="FOR SHOPS"
        title="施工証明の業務を、劇的に効率化"
        subtitle="紙やExcelでの管理から脱却。デジタル証明書で業務品質と顧客満足度を同時に向上させます。"
      />

      {/* 証明書プレビュー — 施工店が最も知りたいのは「発行されるものの品質」 */}
      <Section>
        <SectionHeading
          title="プロフェッショナルな証明書を発行"
          subtitle="施工品質を正しく伝える、ブランド対応のデジタル証明書"
        />
        <ScrollReveal variant="fade-up" delay={100}>
          <div className="max-w-2xl mx-auto">
            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-8 md:p-10">
              <div className="space-y-5">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs text-white/40 uppercase tracking-widest">施工証明書</div>
                    <div className="mt-1 text-base font-bold text-white">ボディコーティング施工証明</div>
                  </div>
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-500/10 border border-green-500/20">
                    <div className="w-1.5 h-1.5 bg-green-400 rounded-full" />
                    <span className="text-xs font-medium text-green-400">有効</span>
                  </div>
                </div>
                <div className="h-px bg-white/[0.06]" />
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <div className="text-white/40">車両</div>
                    <div className="mt-1 text-white/70">Toyota Alphard 2024</div>
                  </div>
                  <div>
                    <div className="text-white/40">施工日</div>
                    <div className="mt-1 text-white/70">2025.03.15</div>
                  </div>
                  <div>
                    <div className="text-white/40">使用材料</div>
                    <div className="mt-1 text-white/70">GYEON Q² One</div>
                  </div>
                  <div>
                    <div className="text-white/40">保証期間</div>
                    <div className="mt-1 text-white/70">5年間</div>
                  </div>
                </div>
                <div className="h-px bg-white/[0.06]" />
                <div className="flex items-center gap-3 text-xs text-white/40">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 text-blue-400">
                    <path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                  CARTRUST認証 · 改ざん防止済み
                </div>
              </div>
            </div>
            <p className="mt-4 text-center text-sm text-white/40">
              自社ロゴ・ブランドカラー・施工写真の反映に対応
            </p>
          </div>
        </ScrollReveal>
      </Section>

      {/* 主要メリット */}
      <Section bg="alt">
        <SectionHeading
          title="CARTRUSTが施工店にもたらす価値"
          subtitle="証明書発行から管理まで、施工店の業務をワンストップで支援します"
        />
        <FeatureGrid>
          <FeatureCard
            delay={0}
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-6 h-6">
                <path d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            }
            title="証明書作成の時間を大幅削減"
            description="テンプレートに沿って入力するだけ。手書きやExcelでの作成から解放され、1件あたりの作成時間を大幅に短縮します。"
          />
          <FeatureCard
            delay={100}
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-6 h-6">
                <path d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            }
            title="顧客への信頼感を向上"
            description="デジタル証明書の発行により、施工品質の見える化を実現。顧客からの信頼獲得と、リピート率の向上につながります。"
          />
          <FeatureCard
            delay={200}
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-6 h-6">
                <path d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
              </svg>
            }
            title="証明書の一元管理"
            description="過去の発行履歴をすべてクラウドで管理。検索・再発行・エクスポートがいつでも可能です。"
          />
        </FeatureGrid>
      </Section>

      {/* 施工種別別の活用例 */}
      <Section>
        <SectionHeading
          title="こんな施工に対応しています"
          subtitle="あらゆる施工タイプの証明書をデジタルで発行"
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { title: "ボディコーティング", desc: "ガラスコーティング、セラミックコーティング等" },
            { title: "PPF（プロテクションフィルム）", desc: "塗装保護フィルムの施工記録" },
            { title: "ウィンドウフィルム", desc: "カーフィルム、断熱フィルムの施工証明" },
            { title: "その他カスタム", desc: "ラッピング、デッドニング等にも対応" },
          ].map((item, i) => (
            <ScrollReveal key={item.title} variant="fade-up" delay={i * 80}>
              <div className="p-5 rounded-xl bg-white/[0.04] border border-white/[0.07] hover:bg-white/[0.07] hover:border-white/[0.12] transition-all duration-300 h-full">
                <h3 className="text-sm font-bold text-white">{item.title}</h3>
                <p className="mt-2 text-xs text-white/50 leading-relaxed">{item.desc}</p>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </Section>

      {/* ワークフロー */}
      <Section bg="alt">
        <SectionHeading
          title="かんたん3ステップで始められます"
          subtitle="面倒な手続きは不要。すぐに使い始められます"
        />
        <div className="max-w-3xl mx-auto">
          {[
            {
              step: "01",
              title: "施工内容を入力",
              description: "テンプレートに沿って、車両情報・施工内容・使用材料を入力します。写真のアップロードも可能です。",
            },
            {
              step: "02",
              title: "証明書を発行",
              description: "入力内容を確認して発行ボタンを押すだけ。改ざん防止のデジタル証明書が即座に生成されます。",
            },
            {
              step: "03",
              title: "URLで共有",
              description: "発行された証明書のURLを顧客や保険会社に共有。QRコードやNFCタグでの共有にも対応しています。",
            },
          ].map((item, i) => (
            <ScrollReveal key={item.step} variant="fade-up" delay={i * 120}>
              <div className="flex gap-6 md:gap-8 items-start py-8 border-b border-white/[0.06] last:border-b-0">
                <div className="flex-shrink-0 w-14 h-14 rounded-xl bg-blue-500/[0.1] flex items-center justify-center">
                  <span className="text-lg font-bold text-blue-400">{item.step}</span>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">{item.title}</h3>
                  <p className="mt-2 text-white/60 leading-relaxed">{item.description}</p>
                </div>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </Section>

      {/* 他店との差別化 */}
      <Section>
        <SectionHeading
          title="他店との差別化ポイントに"
          subtitle="デジタル証明書の導入は、施工店の競争力を高めます"
        />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-10">
          <FeatureCard
            variant="bordered"
            delay={0}
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-6 h-6">
                <path d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            }
            title="保険会社との連携強化"
            description="保険会社が直接証明書を確認できるため、問い合わせ対応が不要に。スムーズな連携で双方の業務負荷を軽減します。"
          />
          <FeatureCard
            variant="bordered"
            delay={100}
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-6 h-6">
                <path d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
            }
            title="スマートフォン対応"
            description="スマートフォンからも証明書の作成・管理が可能。現場でそのまま入力できるため、二度手間を防ぎます。"
          />
          <FeatureCard
            variant="bordered"
            delay={200}
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-6 h-6">
                <path d="M7 7h10v10H7z" />
                <path d="M11 3v4m0 10v4M3 11h4m10 0h4" />
              </svg>
            }
            title="NFCタグ連携"
            description="NFCタグを車両に貼付すれば、お客様がスマホをかざすだけで証明書を確認可能。先進的な顧客体験を提供します。"
          />
          <FeatureCard
            variant="bordered"
            delay={300}
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-6 h-6">
                <path d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
              </svg>
            }
            title="ブランドカスタマイズ"
            description="自社のロゴやカラーを証明書に反映。プロフェッショナルな印象を顧客に与えることができます。"
          />
        </div>
      </Section>

      {/* 料金導線 */}
      <Section bg="alt">
        <ScrollReveal variant="fade-up">
          <div className="text-center max-w-lg mx-auto">
            <h2 className="text-2xl md:text-3xl font-bold text-white">
              無料プランですぐに始められます
            </h2>
            <p className="mt-4 text-white/60">
              月10件まで証明書を無料で発行。クレジットカード不要で今日から使えます。
            </p>
            <div className="mt-8 flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href="/signup"
                className="inline-flex items-center justify-center font-medium rounded-lg text-sm px-8 py-3.5 bg-white text-[#060a12] hover:bg-gray-100 transition-colors active:scale-[0.97]"
              >
                無料で始める
              </Link>
              <Link
                href="/pricing"
                className="inline-flex items-center justify-center font-medium rounded-lg text-sm px-8 py-3.5 border border-white/20 text-white/70 hover:text-white hover:border-white/40 transition-colors active:scale-[0.97]"
              >
                料金プランを見る
              </Link>
            </div>
          </div>
        </ScrollReveal>
      </Section>

      <CTABanner
        title="施工証明書の管理を、今日から効率化"
        subtitle="無料プランで今すぐ始められます。クレジットカード不要。"
        primaryLabel="無料で始める"
        secondaryLabel="資料請求"
      />
    </>
  );
}
