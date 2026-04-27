import Link from "next/link";
import { Section } from "./Section";
import { SectionHeading } from "./SectionHeading";
import { ScrollReveal } from "./ScrollReveal";

/**
 * TrustSecuritySection — セキュリティ・改ざん防止の根拠を、技術構成として開示する。
 *
 * SmartHR 流の「ISO27001 / SOC2 取得済み」型のバッジは持っていない。
 * Ledra はその代わり、Polygon アンカリング・RLS マルチテナント・電子署名・
 * 監査ログ・自動マスクログ などの技術スタックを「具体的に何をやっているか」
 * という形で開示する。取得予定の認証は「取得予定」と明示する。
 */

const PILLARS = [
  {
    title: "Polygon ブロックチェーン・アンカリング",
    desc: "発行された証明書のハッシュを Polygon に書き込み、後から内容を1文字でも書き換えれば検証で必ず破綻するように設計しています。誰が見ても改ざんが分かる、第三者不要の証明です。",
    keywords: ["EIP-191 / EIP-712", "trustless verify", "tx URL 即時公開"],
  },
  {
    title: "テナント分離 (Postgres RLS)",
    desc: "全テーブルに Row Level Security を適用し、サーバー側でも tenant_id をスコープした admin client 経由でのみアクセス。ESLint ルールで違反を検知します。",
    keywords: ["createTenantScopedAdmin", "RLS policy 全テーブル", "TOCTOU 対策済み"],
  },
  {
    title: "電子署名・PDF タイムスタンプ",
    desc: "顧客同意・代理店同意は CUI ベースの電子署名フローで取得し、生成 PDF にハッシュ・発行時刻・QR を埋め込みます。",
    keywords: ["署名前後ハッシュ整合", "OTP メール認証", "QR で公開検証"],
  },
  {
    title: "アプリケーション・セキュリティ",
    desc: "全エンドポイントで rate limit (Upstash Redis)・CSRF 防御・x-request-id 採番。Stripe webhook は冪等処理・cron は HMAC 検証。秘密情報はログから自動マスク。",
    keywords: ["Origin/host チェック", "structured JSON logger", "Sentry 連携"],
  },
];

const COMPLIANCE = [
  { label: "個人情報保護法 (APPI)", status: "compliant" as const, note: "プライバシーポリシー / 開示請求対応" },
  { label: "電子帳簿保存法", status: "compliant" as const, note: "請求書・証憑のタイムスタンプ保管" },
  { label: "適格請求書 (インボイス制度)", status: "compliant" as const, note: "登録番号付き PDF 発行" },
  { label: "電子署名法", status: "compliant" as const, note: "CUI/タイムスタンプ + 監査ログ" },
  { label: "特定商取引法", status: "compliant" as const, note: "/tokusho に基づく表示" },
  { label: "ISO/IEC 27001 (ISMS)", status: "planned" as const, note: "正式取得を計画中 (パイロット完了後)" },
  { label: "SOC 2 Type II", status: "planned" as const, note: "監査受審の準備フェーズ" },
  { label: "Pマーク", status: "planned" as const, note: "申請準備中" },
];

function Badge({ status }: { status: "compliant" | "planned" }) {
  if (status === "compliant") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 border border-emerald-400/30 px-2 py-0.5 text-[0.65rem] font-medium text-emerald-300">
        <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M2 6l3 3 5-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        対応済み
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 border border-blue-400/30 px-2 py-0.5 text-[0.65rem] font-medium text-blue-300">
      <span className="block w-1.5 h-1.5 rounded-full bg-blue-300" />
      取得予定
    </span>
  );
}

export function TrustSecuritySection() {
  return (
    <Section id="security">
      <SectionHeading
        title="信頼の根拠を、隠さず開示する。"
        subtitle="Ledra は「証明書を発行するサービス」を名乗る以上、自らの仕組みも検証可能であるべきだと考えています。技術構成と法令対応を、できる限り具体的に開示します。"
      />

      <div className="mx-auto max-w-5xl grid grid-cols-1 md:grid-cols-2 gap-5">
        {PILLARS.map((p, i) => (
          <ScrollReveal key={p.title} variant="fade-up" delay={i * 80}>
            <div className="h-full rounded-2xl border border-white/[0.08] bg-white/[0.03] p-7 hover:bg-white/[0.06] hover:border-white/[0.14] transition-colors">
              <h3 className="text-base font-bold text-white tracking-tight">{p.title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-white/80">{p.desc}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {p.keywords.map((k) => (
                  <span
                    key={k}
                    className="inline-flex items-center rounded-md border border-white/[0.08] bg-white/[0.02] px-2 py-0.5 text-[0.65rem] font-medium text-white/75"
                  >
                    {k}
                  </span>
                ))}
              </div>
            </div>
          </ScrollReveal>
        ))}
      </div>

      {/* Compliance matrix */}
      <ScrollReveal variant="fade-up" delay={200}>
        <div className="mx-auto mt-12 max-w-5xl rounded-2xl border border-white/[0.08] bg-white/[0.02]">
          <div className="px-6 py-4 border-b border-white/[0.06] flex items-center justify-between">
            <h3 className="text-sm font-bold text-white">法令・第三者認証 対応マトリクス</h3>
            <span className="text-[0.65rem] uppercase tracking-widest text-white/70">Compliance</span>
          </div>
          <ul className="divide-y divide-white/[0.06]">
            {COMPLIANCE.map((c) => (
              <li key={c.label} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-6 py-4">
                <div className="flex items-center gap-3">
                  <Badge status={c.status} />
                  <span className="text-sm font-medium text-white">{c.label}</span>
                </div>
                <span className="text-xs text-white/70 sm:text-right">{c.note}</span>
              </li>
            ))}
          </ul>
        </div>
      </ScrollReveal>

      <ScrollReveal variant="fade-in" delay={300}>
        <div className="mt-8 text-center">
          <Link
            href="/security"
            className="inline-flex items-center gap-1 text-sm font-medium text-blue-400 hover:underline"
          >
            セキュリティの詳細を見る &rarr;
          </Link>
        </div>
      </ScrollReveal>
    </Section>
  );
}
