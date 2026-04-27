import Link from "next/link";
import { Section } from "./Section";
import { SectionHeading } from "./SectionHeading";
import { ScrollReveal } from "./ScrollReveal";

/**
 * CustomerSuccessSection — 「導入後の伴走」を明示する。
 *
 * SmartHR の継続利用率99.5%の核は、専任CSによるオンボーディングと活用支援。
 * Ledra も同等の伴走 (パイロットフェーズではむしろ濃く) を提供することを
 * セールスメッセージとして明文化する。
 */

const PHASES = [
  {
    phase: "Phase 1",
    title: "キックオフ・初期設定 (1〜3日)",
    items: [
      "ヒアリング (店舗体制・既存帳票・取引保険会社)",
      "テナント開設・スタッフ招待",
      "施工メニュー・テンプレート設定",
      "ロゴ・ブランドカラーの反映",
    ],
  },
  {
    phase: "Phase 2",
    title: "現場で1枚目を発行 (1〜2週間)",
    items: [
      "実車での発行ロールプレイ",
      "QRシール・URL共有フローの定着",
      "保険会社ポータル連携の確認",
      "つまずきを Slack / メールで即時解消",
    ],
  },
  {
    phase: "Phase 3",
    title: "業務に組み込む (1〜2ヶ月)",
    items: [
      "請求・予約・代理店連携などの追加機能展開",
      "CSV/PDF 一括出力・レポート活用",
      "API 連携 (希望時)",
      "月次レビューで運用改善",
    ],
  },
  {
    phase: "Phase 4",
    title: "活用の伴走 (継続)",
    items: [
      "新機能のプライベートベータ案内",
      "事例化・登壇 (希望時) のサポート",
      "ロードマップへのリクエスト権",
      "ユーザーコミュニティへのご招待",
    ],
  },
];

const SUPPORTS = [
  {
    title: "メール / フォームサポート",
    desc: "全プラン標準。原則1営業日以内に返信。",
  },
  {
    title: "Slack Connect (希望時)",
    desc: "スタンダード以上で、貴社チャンネルに直接担当が参加。",
  },
  {
    title: "ヘルプセンター・動画チュートリアル",
    desc: "「触ってわかる」コンテンツを順次拡充。",
  },
  {
    title: "オンライン勉強会",
    desc: "月次で機能アップデート・活用Tipsをシェア。",
  },
];

export function CustomerSuccessSection() {
  return (
    <Section bg="alt" id="customer-success">
      <SectionHeading
        title="導入して終わり、にしません。"
        subtitle="施工現場のSaaS導入は「設定したのに誰も使わなくなる」が一番もったいない結末です。Ledra は、現場で1枚目が発行されるところまで、必ず伴走します。"
      />

      {/* Phases timeline */}
      <div className="mx-auto max-w-5xl grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {PHASES.map((p, i) => (
          <ScrollReveal key={p.phase} variant="fade-up" delay={i * 80}>
            <div className="h-full rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6 hover:bg-white/[0.06] hover:border-white/[0.14] transition-colors">
              <div className="text-[0.65rem] font-medium uppercase tracking-widest text-blue-300/80">{p.phase}</div>
              <h3 className="mt-3 text-sm font-bold text-white leading-snug">{p.title}</h3>
              <ul className="mt-4 space-y-2">
                {p.items.map((it) => (
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

      {/* Support channels */}
      <ScrollReveal variant="fade-up" delay={300}>
        <div className="mx-auto mt-12 max-w-5xl rounded-2xl border border-white/[0.08] bg-white/[0.02] p-7">
          <h3 className="text-sm font-bold text-white">サポートチャネル</h3>
          <div className="mt-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {SUPPORTS.map((s) => (
              <div key={s.title} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                <p className="text-sm font-semibold text-white">{s.title}</p>
                <p className="mt-2 text-xs leading-relaxed text-white/80">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </ScrollReveal>

      <ScrollReveal variant="fade-in" delay={400}>
        <div className="mt-8 text-center">
          <Link
            href="/support"
            className="inline-flex items-center gap-1 text-sm font-medium text-blue-400 hover:underline"
          >
            導入支援の詳細を見る &rarr;
          </Link>
        </div>
      </ScrollReveal>
    </Section>
  );
}
