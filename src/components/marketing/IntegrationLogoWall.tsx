import Image from "next/image";
import { Section } from "./Section";
import { SectionHeading } from "./SectionHeading";
import { ScrollReveal } from "./ScrollReveal";

/**
 * Integration logo wall — カラーロゴ使用許諾までは、ブランドテキストチップで見せる。
 * 許諾が揃い次第、各アイテムに SVG/画像ロゴを差し替える。
 */

type Integration = {
  name: string;
  note?: string;
  href: string;
  logo?: {
    src: string;
    width: number;
    height: number;
  };
};

const INTEGRATIONS: Integration[] = [
  {
    name: "Stripe",
    note: "サブスクリプション・請求書",
    href: "https://stripe.com/jp",
    logo: { src: "/brands/stripe-wordmark-white.svg", width: 360, height: 151 },
  },
  {
    name: "Square",
    note: "POS端末決済・在庫同期",
    href: "https://squareup.com/jp",
    logo: { src: "/brands/Square_Logo_2025_White.svg", width: 2000, height: 501 },
  },
  {
    name: "freee会計",
    note: "入金済請求書を自動で仕訳連携",
    href: "https://www.freee.co.jp/",
  },
  {
    name: "マネーフォワード クラウド",
    note: "会計仕訳の自動同期",
    href: "https://biz.moneyforward.com/",
  },
  {
    name: "Google Calendar",
    note: "予約カレンダー双方向同期",
    href: "https://calendar.google.com/",
    logo: { src: "/brands/google-color.svg", width: 24, height: 24 },
  },
  {
    name: "LINE",
    note: "顧客通知・リマインド",
    href: "https://line.me/ja/",
    logo: { src: "/brands/LINE_Brand_icon.png", width: 1001, height: 1000 },
  },
  {
    name: "Polygon",
    note: "証明書アンカリング",
    href: "https://polygon.technology/",
    logo: { src: "/brands/Polygon_Logo_HiRes.png", width: 2915, height: 802 },
  },
  {
    name: "Resend",
    note: "トランザクションメール",
    href: "https://resend.com/",
    logo: { src: "/brands/resend-wordmark-white.svg", width: 1978, height: 420 },
  },
  { name: "C2PA", note: "写真コンテンツクレデンシャル", href: "https://c2pa.org/" },
  {
    name: "Claude",
    note: "車検証OCR・写真品質検証・エージェント",
    href: "https://claude.com/",
    logo: { src: "/brands/claude-color.svg", width: 24, height: 24 },
  },
  {
    name: "NexDiag",
    note: "膜厚計測・コーティング検証",
    href: "https://nexdiag.com/",
    logo: { src: "/nexdiag_logo.svg", width: 1122, height: 794 },
  },
  {
    name: "Upstash",
    note: "分散レート制限・キャッシュ",
    href: "https://upstash.com/",
    logo: { src: "/brands/upstash-dark-bg.svg", width: 1631, height: 472 },
  },
  {
    name: "Supabase",
    note: "RLS付きデータ基盤",
    href: "https://supabase.com/",
    logo: { src: "/brands/supabase-logo-wordmark--dark.svg", width: 581, height: 113 },
  },
];

export function IntegrationLogoWall() {
  return (
    <Section bg="alt" id="integrations">
      <SectionHeading
        title="既にある現場の道具と、そのままつながる"
        subtitle="Ledra は業務の置き換えを強いません。今使っているPOS・決済・メッセージ・カレンダーと無理なくつなぎ、記録だけをデジタルに変えていきます。"
      />
      <div className="mx-auto mt-12 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 md:gap-4 max-w-5xl">
        {INTEGRATIONS.map((item, i) => (
          <ScrollReveal key={item.name} variant="fade-up" delay={Math.floor(i / 4) * 60}>
            <a
              href={item.href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`${item.name} の公式サイト（新しいタブで開く）`}
              className="group block h-full rounded-2xl border border-white/[0.14] bg-white/[0.06] p-5 md:p-6 text-center hover:bg-white/[0.10] hover:border-white/[0.22] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 transition-colors"
            >
              <div className="flex h-full flex-col items-center justify-center">
                {item.logo ? (
                  <div className="flex h-11 md:h-14 items-center justify-center">
                    <Image
                      src={item.logo.src}
                      alt={`${item.name} logo`}
                      width={item.logo.width}
                      height={item.logo.height}
                      className="h-full w-auto object-contain"
                      sizes="(min-width: 768px) 220px, 170px"
                    />
                  </div>
                ) : (
                  <p className="text-base md:text-lg font-semibold text-white tracking-tight">{item.name}</p>
                )}
                {item.note && <p className="mt-2 text-xs leading-relaxed text-white">{item.note}</p>}
              </div>
            </a>
          </ScrollReveal>
        ))}
      </div>
      <p className="mt-10 text-center text-sm text-white leading-relaxed">
        ※ 各サービス名および関連商標は、それぞれの権利者に帰属します。
        <br className="hidden md:block" />
        現在、ロゴ使用許諾については順次交渉を進めており、許諾済みのパートナーから画像ロゴに差し替えていきます。
      </p>
      <ul className="mx-auto mt-4 max-w-3xl space-y-1 text-center text-xs text-white/80 leading-relaxed">
        <li>LINE、LINEのロゴは、LINEヤフー株式会社の登録商標または商標です。</li>
        <li>Polygon は Polygon Labs UI Labs Limited およびその関連会社の商標です。</li>
        <li>Resend は Resend, Inc. の商標です。</li>
        <li>Upstash は Upstash, Inc. の商標です。</li>
        <li>Supabase は Supabase Inc. の登録商標または商標です。</li>
        <li>Stripe は Stripe, Inc. の商標です。</li>
        <li>Square は Block, Inc. の商標です。</li>
        <li>freee、freee会計 は freee株式会社の商標または登録商標です。</li>
        <li>マネーフォワード クラウド は株式会社マネーフォワードの商標または登録商標です。</li>
        <li>Google および Google Calendar は Google LLC の商標です。</li>
        <li>Claude は Anthropic PBC の商標です。</li>
      </ul>
    </Section>
  );
}
