import type { ReactNode } from "react";
import { PageHero } from "@/components/marketing/PageHero";
import { Section } from "@/components/marketing/Section";
import { SectionHeading } from "@/components/marketing/SectionHeading";
import { ScrollReveal } from "@/components/marketing/ScrollReveal";
import { CTABanner } from "@/components/marketing/CTABanner";
import { SecurityLayersDiagram } from "@/components/marketing/diagrams/SecurityLayersDiagram";
import { PolygonAnchoringDiagram } from "@/components/marketing/diagrams/PolygonAnchoringDiagram";

export const metadata = {
  title: "セキュリティ",
  description:
    "Ledra のセキュリティ対策。暗号化・アクセス制御・バックアップ・脆弱性対応・改ざん防止の5観点で、記録の信頼を守ります。",
  alternates: { canonical: "/security" },
};

type Block = {
  id: string;
  title: string;
  lead: string;
  items: { title: string; desc: ReactNode }[];
};

const blocks: Block[] = [
  {
    id: "encryption",
    title: "1. 暗号化",
    lead: "通信・保存・ペイロードの3層で、データを守ります。",
    items: [
      {
        title: "通信の暗号化（TLS 1.2+）",
        desc: "アプリとAPIの全トラフィックを TLS で暗号化。Vercel の HTTPS 終端を使用し、HSTS を有効化しています。",
      },
      {
        title: "保存データの暗号化",
        desc: "Supabase Postgres はディスク暗号化（AES-256）および自動鍵ローテーションを実装。オブジェクトストレージも転送時・保管時ともに暗号化。",
      },
      {
        title: "機微データのペッパリング",
        desc: "顧客認証に用いる電話番号末尾4桁などは、アプリレイヤでpepper付きハッシュ化してから保存。DB流出時にも生値が復元できない形に。",
      },
      {
        title: "Polygon anchoring",
        desc: "施工写真の SHA-256 ハッシュを Polygon ブロックチェーンに刻印。仮に DB 側の写真が差し替えられても、チェーン上のアンカーと突き合わせて不整合を即検知できます。",
      },
    ],
  },
  {
    id: "access-control",
    title: "2. アクセス制御",
    lead: "役割・テナント・セッション境界を、DBレベルで強制します。",
    items: [
      {
        title: "Row Level Security（RLS）",
        desc: "Supabase の RLS を全テーブルで有効化。テナント・役割・所有者の3軸で、SQLレイヤでアクセス可能な行を制限。",
      },
      {
        title: "役割ベースアクセス制御（RBAC）",
        desc: "Owner / Admin / Staff / Viewer の4段階に加え、代理店・保険会社・顧客の独立したロール。必要最小限の権限のみを付与。",
      },
      {
        title: "多要素認証（MFA）対応",
        desc: "ポータルユーザー向けに、Supabase Auth の TOTP/SMS MFA を設定可能。",
      },
      {
        title: "セッション管理",
        desc: "顧客ポータルは専用のセッション有効期限（デフォルト24時間）。署名付きURLは1回限りのトークンで発行。",
      },
      {
        title: "レート制限",
        desc: "Upstash Redis による分散レートリミット。ログイン・問合せ・APIごとに上限を設定し、ブルートフォース・スクレイピングを抑制。",
      },
    ],
  },
  {
    id: "backup",
    title: "3. バックアップ・可用性",
    lead: "喪失と停止に備え、復旧を既定の運用に。",
    items: [
      {
        title: "日次自動バックアップ",
        desc: "Supabase Postgres の日次自動バックアップ＋ポイントインタイムリカバリ。誤削除から任意時点への復旧を可能にします。",
      },
      {
        title: "地理冗長配置",
        desc: "アプリケーションは Vercel の東京リージョンを主、グローバルエッジキャッシュを併用。大規模障害時も読み取りは継続可能。",
      },
      {
        title: "監視・アラート",
        desc: "Sentry による例外トラッキング、Vercel Analytics / Speed Insights による性能監視。Cron ジョブの失敗検知も自動化。",
      },
    ],
  },
  {
    id: "vulnerability",
    title: "4. 脆弱性対応",
    lead: "見つけ次第、直す。その運用を仕組みで。",
    items: [
      {
        title: "依存ライブラリの継続監視",
        desc: "GitHub Dependabot により CVE を日次監視。Critical は即時、High は72時間以内に対応する運用ルール。",
      },
      {
        title: "CI でのセキュリティチェック",
        desc: "ESLint の security ルール、Secret scanning、型チェックをプルリクエストごとに実行。マージ前に既知の問題を遮断。",
      },
      {
        title: "ログ監査",
        desc: "認証・証明書発行・無効化・顧客情報閲覧など、重要操作の監査ログを保存。異常操作の追跡が可能。",
      },
      {
        title: "脆弱性報告窓口",
        desc: (
          <>
            セキュリティに関する問題を発見された場合は、 <a
              href="mailto:security@ledra.co.jp"
              className="text-blue-400 hover:underline"
            >
              security@ledra.co.jp
            </a> までご連絡ください。ご連絡から3営業日以内に初期対応いたします。
          </>
        ),
      },
    ],
  },
  {
    id: "tamper-prevention",
    title: "5. 改ざん防止",
    lead: "『記録を、業界の共通言語にする』ための根拠。",
    items: [
      {
        title: "証明書編集履歴",
        desc: "証明書への編集操作は差分付きで編集履歴に保存。『誰が、いつ、何を変えたか』を後から確認できます。",
      },
      {
        title: "C2PA画像署名",
        desc: "施工写真を証明書と紐付ける際、C2PA規格で署名付きのコンテンツクレデンシャルを埋め込み。SNS等で再配布されても出自を追跡可能。",
      },
      {
        title: "Polygon anchoring",
        desc: "発行時に証明書コンテンツのハッシュを Polygon に刻印。後からデータが書き換えられても、チェーン上のアンカーとの差分で検知できます。",
      },
      {
        title: "デジタル署名",
        desc: "証明書PDFには Ledra の署名鍵で署名を付与。発行元の同一性を第三者が検証可能。",
      },
    ],
  },
];

type CertStatus = {
  label: string;
  status: "planned" | "in-progress" | "obtained";
  note: string;
};

const certifications: CertStatus[] = [
  {
    label: "ISMS（ISO/IEC 27001）",
    status: "planned",
    note: "取得準備中。",
  },
  {
    label: "プライバシーマーク",
    status: "planned",
    note: "取得準備中。",
  },
];

export default function SecurityPage() {
  return (
    <>
      <PageHero
        badge="SECURITY"
        title="記録の信頼を、仕組みで守る。"
        subtitle="暗号化・アクセス制御・バックアップ・脆弱性対応・改ざん防止。 Ledra のセキュリティへのアプローチを、誠実にご紹介します。"
      />

      <Section bg="alt" className="!py-12 md:!py-16">
        <nav className="flex flex-wrap justify-center gap-2" aria-label="セキュリティ項目">
          {blocks.map((b) => (
            <a
              key={b.id}
              href={`#${b.id}`}
              className="inline-flex items-center rounded-full border border-white/[0.08] bg-white/[0.03] px-4 py-2 text-xs font-medium text-white/70 hover:bg-white/[0.07] hover:text-white hover:border-white/[0.14] transition-colors"
            >
              {b.title}
            </a>
          ))}
        </nav>
      </Section>

      {/* 3層モデルの全体図 */}
      <Section>
        <SectionHeading
          title="Ledra のセキュリティ3層モデル"
          subtitle="通信・保存・ペイロードの3層で、独立に働く防御を重ねています。"
        />
        <ScrollReveal variant="fade-up">
          <div className="mx-auto mt-8 max-w-4xl rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4 md:p-8">
            <SecurityLayersDiagram className="w-full h-auto" />
          </div>
        </ScrollReveal>
      </Section>

      {blocks.map((b, idx) => (
        <Section key={b.id} id={b.id} bg={idx % 2 === 0 ? "white" : "alt"}>
          <SectionHeading title={b.title} subtitle={b.lead} />
          <div className="mx-auto max-w-3xl space-y-5">
            {b.items.map((item, i) => (
              <ScrollReveal key={item.title} variant="fade-up" delay={i * 50}>
                <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6 md:p-7">
                  <h3 className="text-[1.063rem] font-bold text-white leading-snug">
                    {item.title}
                  </h3>
                  <p className="mt-2 text-[0.938rem] leading-[1.85] text-white/60">
                    {item.desc}
                  </p>
                </div>
              </ScrollReveal>
            ))}

            {/* Polygon anchoring のフロー図 — 改ざん防止ブロックの末尾に */}
            {b.id === "tamper-prevention" && (
              <ScrollReveal variant="fade-up" delay={b.items.length * 50}>
                <div className="mt-8 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4 md:p-8">
                  <p className="mb-4 text-center text-xs font-medium uppercase tracking-widest text-blue-300">
                    Polygon anchoring フロー
                  </p>
                  <PolygonAnchoringDiagram className="w-full h-auto" />
                </div>
              </ScrollReveal>
            )}
          </div>
        </Section>
      ))}

      <Section>
        <SectionHeading
          title="認証・コンプライアンス"
          subtitle="第三者認証の取得状況を、率直にお伝えします。"
        />
        <div className="mx-auto max-w-2xl space-y-4">
          {certifications.map((c) => (
            <div
              key={c.label}
              className="flex items-start justify-between gap-4 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5"
            >
              <div>
                <p className="text-sm font-bold text-white">{c.label}</p>
                <p className="mt-1 text-xs text-white/50">{c.note}</p>
              </div>
              <span
                className={`shrink-0 inline-flex items-center rounded-full px-3 py-1 text-[0.688rem] font-medium ${
                  c.status === "obtained"
                    ? "bg-emerald-500/[0.12] text-emerald-300 border border-emerald-500/20"
                    : c.status === "in-progress"
                      ? "bg-amber-500/[0.12] text-amber-300 border border-amber-500/20"
                      : "bg-white/[0.06] text-white/60 border border-white/[0.1]"
                }`}
              >
                {c.status === "obtained"
                  ? "取得済"
                  : c.status === "in-progress"
                    ? "取得中"
                    : "未取得・計画中"}
              </span>
            </div>
          ))}
          <p className="pt-4 text-xs text-white/40 text-center leading-relaxed">
            認証取得の進捗は、本ページにて随時更新してまいります。
            <br />
            詳細な技術仕様はセキュリティホワイトペーパーをご請求ください。
          </p>
        </div>
      </Section>

      <CTABanner
        title="セキュリティの詳細を、資料でお届けします"
        subtitle="暗号化方式・鍵管理・RLS設計・監査ログ仕様を記したホワイトペーパーをお送りします。"
        primaryLabel="ホワイトペーパーをダウンロード"
        primaryHref="/resources"
        secondaryLabel="お問い合わせ"
        secondaryHref="/contact"
      />
    </>
  );
}
