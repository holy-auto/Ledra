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
};

const INTEGRATIONS: Integration[] = [
  { name: "Stripe", note: "サブスクリプション・請求書" },
  { name: "Square", note: "POS端末決済・在庫同期" },
  { name: "Google Calendar", note: "予約カレンダー双方向同期" },
  { name: "LINE", note: "顧客通知・リマインド" },
  { name: "Polygon", note: "証明書アンカリング" },
  { name: "Resend", note: "トランザクションメール" },
  { name: "C2PA", note: "写真コンテンツクレデンシャル" },
  { name: "Claude", note: "車検証OCR・写真品質検証・エージェント" },
  { name: "Upstash", note: "分散レート制限・キャッシュ" },
  { name: "Supabase", note: "RLS付きデータ基盤" },
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
            <div className="group h-full rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5 md:p-6 text-center hover:bg-white/[0.06] hover:border-white/[0.14] transition-colors">
              <p className="text-sm md:text-base font-semibold text-white tracking-tight">{item.name}</p>
              {item.note && <p className="mt-1.5 text-[0.688rem] leading-relaxed text-white/75">{item.note}</p>}
            </div>
          </ScrollReveal>
        ))}
      </div>
      <p className="mt-10 text-center text-xs text-white/75 leading-relaxed">
        ※ 各サービス名および関連商標は、それぞれの権利者に帰属します。
        <br className="hidden md:block" />
        現在、ロゴ使用許諾については順次交渉を進めており、許諾済みのパートナーから画像ロゴに差し替えていきます。
      </p>
    </Section>
  );
}
