import { ScrollReveal } from "./ScrollReveal";

type Pillar = {
  title: string;
  description: string;
  icon: React.ReactNode;
};

const PILLARS: Pillar[] = [
  {
    title: "改ざん検知",
    description:
      "発行された証明書の内容はハッシュ署名で固定され、第三者による改ざんを即座に検出できる構造を採用しています。",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="w-7 h-7">
        <path d="M12 2l8 4v6c0 5-3.5 9-8 10-4.5-1-8-5-8-10V6l8-4z" />
        <path d="M9 12l2 2 4-4" />
      </svg>
    ),
  },
  {
    title: "通信暗号化",
    description: "サイト全体および証明書共有URLはTLS1.2以上で暗号化。データ転送経路上の盗聴・なりすましを防ぎます。",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="w-7 h-7">
        <rect x="4" y="11" width="16" height="10" rx="2" />
        <path d="M8 11V7a4 4 0 018 0v4" />
      </svg>
    ),
  },
  {
    title: "アクセス権限管理",
    description:
      "施工店・代理店・保険会社・運営者の権限境界を明確化。最小権限の原則に基づくロール設計を採用しています。",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="w-7 h-7">
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21v-1a8 8 0 0116 0v1" />
      </svg>
    ),
  },
  {
    title: "監査ログ",
    description:
      "発行・閲覧・編集・削除のすべての操作をタイムスタンプ付きで記録。インシデント発生時の追跡性を担保します。",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="w-7 h-7">
        <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" />
        <path d="M9 5a2 2 0 002 2h2a2 2 0 002-2" />
        <path d="M9 12h6M9 16h4" />
      </svg>
    ),
  },
];

const COMPLIANCE_BADGES = [
  { label: "個人情報保護", sub: "Privacy Policy 準拠" },
  { label: "TLS 1.2+", sub: "End-to-End 暗号化" },
  { label: "改ざん検知", sub: "Hash-based Integrity" },
  { label: "二要素認証", sub: "対応予定" },
];

export function SecurityTrust() {
  return (
    <div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 md:gap-6">
        {PILLARS.map((pillar, i) => (
          <ScrollReveal key={pillar.title} variant="fade-up" delay={i * 80}>
            <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] hover:bg-white/[0.04] hover:border-white/[0.12] transition-all duration-400 p-7 md:p-8 h-full">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500/15 to-violet-500/10 text-blue-300 flex items-center justify-center mb-5 border border-blue-500/15">
                {pillar.icon}
              </div>
              <h3
                className="text-[1.0625rem] md:text-[1.125rem] font-semibold text-white tracking-tight mb-3"
                style={{ fontFamily: "var(--font-serif)" }}
              >
                {pillar.title}
              </h3>
              <p className="text-[0.875rem] leading-[1.8] text-white/70">{pillar.description}</p>
            </div>
          </ScrollReveal>
        ))}
      </div>

      <ScrollReveal variant="fade-up" delay={400}>
        <div className="mt-12 md:mt-14 rounded-2xl border border-white/[0.06] bg-white/[0.02] px-6 py-6 md:px-10 md:py-7">
          <div className="flex flex-col md:flex-row md:items-center gap-6 md:gap-10">
            <div className="text-[0.6875rem] font-semibold tracking-[0.22em] uppercase text-white/50 md:border-r md:border-white/[0.08] md:pr-10">
              Compliance & Security
            </div>
            <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-5">
              {COMPLIANCE_BADGES.map((badge) => (
                <div key={badge.label} className="text-left md:text-center">
                  <div className="text-sm md:text-base font-semibold text-white">{badge.label}</div>
                  <div className="text-[0.6875rem] text-white/55 mt-1 tracking-wide">{badge.sub}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </ScrollReveal>
    </div>
  );
}
