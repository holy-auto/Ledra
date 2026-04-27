import Link from "next/link";
import { Section } from "./Section";
import { ScrollReveal } from "./ScrollReveal";

/**
 * QuickStartReliabilityBar — 「導入ハードルの低さ」「稼働の透明性」を1帯で。
 *
 * SmartHR が無料試用と稼働率訴求を同居させる文脈に倣い、Ledra も
 * Quick Start (クレカ不要・5分・データ移行支援) と Reliability (SLA・status・
 * Sentry 監視) を一画面に並べて訴求する。
 *
 * 数字 (稼働率/インシデント数) は status ページが整備でき次第更新する想定。
 */

const QUICK_START = [
  { title: "クレジットカード不要", desc: "無料プランは登録だけで利用開始。" },
  { title: "5分で初期設定", desc: "店舗情報とロゴを入れれば初回発行可能。" },
  { title: "データ移行はこちらで", desc: "既存の証明書・顧客台帳の取り込みを支援。" },
];

const RELIABILITY = [
  { metric: "目標稼働率", value: "99.9%", note: "月次計測 / インシデントは status で開示" },
  { metric: "監視", value: "24/7", note: "Sentry + Vercel + Upstash 二重監視" },
  { metric: "RPO", value: "≤ 1h", note: "Postgres / Storage 自動バックアップ" },
];

export function QuickStartReliabilityBar() {
  return (
    <Section id="quick-start">
      <div className="mx-auto max-w-5xl grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Quick Start */}
        <ScrollReveal variant="fade-right">
          <div className="h-full rounded-2xl border border-white/[0.08] bg-white/[0.03] p-7">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2.5 py-0.5 text-[0.65rem] font-medium uppercase tracking-widest text-emerald-200">
                Quick Start
              </span>
              <span className="text-[0.65rem] text-white/70">導入のハードルを下げています</span>
            </div>
            <h3 className="mt-4 text-base font-bold text-white">いつでも、すぐに始められます。</h3>
            <ul className="mt-5 space-y-3">
              {QUICK_START.map((q) => (
                <li key={q.title} className="flex items-start gap-3">
                  <span className="mt-1 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500/30 to-emerald-500/10 border border-emerald-500/20">
                    <svg
                      className="w-3 h-3 text-emerald-300"
                      viewBox="0 0 12 12"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M2 6l3 3 5-6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-white">{q.title}</p>
                    <p className="mt-1 text-xs text-white/80">{q.desc}</p>
                  </div>
                </li>
              ))}
            </ul>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="/signup"
                className="inline-flex items-center justify-center font-medium rounded-lg text-sm px-5 py-2.5 bg-white text-[#060a12] hover:bg-gray-100 transition-colors"
              >
                無料で試す
              </Link>
              <Link
                href="/pricing"
                className="inline-flex items-center justify-center font-medium rounded-lg text-sm px-5 py-2.5 border border-white/20 text-white/80 hover:text-white hover:border-white/40 transition-colors"
              >
                料金を見る
              </Link>
            </div>
          </div>
        </ScrollReveal>

        {/* Reliability */}
        <ScrollReveal variant="fade-left" delay={120}>
          <div className="h-full rounded-2xl border border-white/[0.08] bg-white/[0.03] p-7">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center rounded-full border border-blue-400/30 bg-blue-500/10 px-2.5 py-0.5 text-[0.65rem] font-medium uppercase tracking-widest text-blue-200">
                Reliability
              </span>
              <span className="text-[0.65rem] text-white/70">稼働も、透明に。</span>
            </div>
            <h3 className="mt-4 text-base font-bold text-white">サービスの状態を、いつでも確認できます。</h3>
            <dl className="mt-5 grid grid-cols-3 gap-3">
              {RELIABILITY.map((r) => (
                <div key={r.metric} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-center">
                  <dt className="text-[0.6rem] uppercase tracking-widest text-white/70">{r.metric}</dt>
                  <dd className="mt-1.5 text-base font-bold text-white">{r.value}</dd>
                  <p className="mt-1 text-[0.6rem] leading-relaxed text-white/70">{r.note}</p>
                </div>
              ))}
            </dl>
            <p className="mt-5 text-xs leading-relaxed text-white/80">
              インシデントが発生した場合は、Status ページに即時掲載し、原因・影響範囲・復旧見込みを継続更新します。
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link
                href="/security"
                className="inline-flex items-center gap-1 text-xs font-medium text-blue-300 hover:text-blue-200"
              >
                セキュリティ &rarr;
              </Link>
              <Link
                href="/support"
                className="inline-flex items-center gap-1 text-xs font-medium text-blue-300 hover:text-blue-200"
              >
                サポート &rarr;
              </Link>
            </div>
          </div>
        </ScrollReveal>
      </div>
    </Section>
  );
}
