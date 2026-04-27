import Link from "next/link";
import { Section } from "./Section";
import { SectionHeading } from "./SectionHeading";
import { ScrollReveal } from "./ScrollReveal";

/**
 * FeatureCatalogSection — トップに「全機能カタログ」を圧縮して見せる。
 *
 * SmartHR の /function/ に相当する網羅性訴求。3カードだけだと「証明書発行
 * しか出来ない」ように映るので、請求・電子署名・代理店・損保連携・予約・
 * 顧客ポータル・モバイル等を一目で示す。
 */

const CATEGORIES = [
  {
    title: "施工証明・記録",
    items: [
      "テンプレート発行 (写真・動画・C2PA)",
      "改ざん防止 (Polygon アンカリング)",
      "QR / URL 共有",
      "顧客ロゴ・ブランドカラー反映",
      "履歴の一元管理 / 検索",
    ],
  },
  {
    title: "顧客ポータル",
    items: [
      "OTPメール認証のマイページ",
      "保証期間・施工履歴の閲覧",
      "再発行・問い合わせ導線",
      "車両ごとのタイムライン",
    ],
  },
  {
    title: "請求・帳票",
    items: [
      "Stripe サブスク・請求書",
      "適格請求書 (インボイス) 対応",
      "見積・請求 PDF",
      "Square POS 連携",
      "月次レポート",
    ],
  },
  {
    title: "電子署名・同意",
    items: ["顧客同意・代理店同意フロー", "PDFタイムスタンプ・ハッシュ", "監査ログ (改ざん検出)", "OTP 二段階認証"],
  },
  {
    title: "保険会社・損保連携",
    items: ["保険会社専用ポータル", "URL照会・CSV一括出力", "API連携 (プロ)", "案件単位の連携・コメント"],
  },
  {
    title: "代理店ネットワーク",
    items: ["代理店招待・成約管理", "報酬計算・支払", "代理店専用ダッシュボード", "電子署名対応"],
  },
  {
    title: "予約・カレンダー",
    items: ["Google Calendar 双方向同期", "オンライン予約フォーム", "リマインドメール / LINE", "稼働率レポート"],
  },
  {
    title: "モバイル・現場",
    items: ["PWA (オフライン耐性)", "iPhone Tap to Pay", "撮影→紐付け→発行を片手で", "QRシール印刷"],
  },
  {
    title: "管理・運用",
    items: [
      "RLS によるテナント分離",
      "ロール / 権限管理",
      "監査ログ・操作履歴",
      "Webhook / API",
      "Sentry / 構造化ログ",
    ],
  },
];

export function FeatureCatalogSection() {
  return (
    <Section bg="alt" id="feature-catalog">
      <SectionHeading
        title="現場運営に必要なものを、ひとつのプロダクトで。"
        subtitle="証明書発行は入口です。請求・電子署名・代理店・保険連携・予約・モバイル決済まで、施工店の業務を一周通して支えます。"
      />

      <div className="mx-auto max-w-6xl grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {CATEGORIES.map((c, i) => (
          <ScrollReveal key={c.title} variant="fade-up" delay={(i % 3) * 80}>
            <div className="h-full rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6 hover:bg-white/[0.06] hover:border-white/[0.14] transition-colors">
              <h3 className="text-sm font-bold text-white tracking-tight">{c.title}</h3>
              <ul className="mt-4 space-y-2">
                {c.items.map((it) => (
                  <li key={it} className="flex items-start gap-2 text-xs leading-relaxed text-white/80">
                    <svg
                      className="w-3 h-3 mt-0.5 flex-shrink-0 text-blue-400"
                      viewBox="0 0 12 12"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M2 6l3 3 5-6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    {it}
                  </li>
                ))}
              </ul>
            </div>
          </ScrollReveal>
        ))}
      </div>

      <ScrollReveal variant="fade-in" delay={300}>
        <div className="mt-10 text-center">
          <Link
            href="/features"
            className="inline-flex items-center gap-1 text-sm font-medium text-blue-400 hover:underline"
          >
            機能の詳細を見る &rarr;
          </Link>
        </div>
      </ScrollReveal>
    </Section>
  );
}
