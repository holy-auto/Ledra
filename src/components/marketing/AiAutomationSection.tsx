import { Section } from "./Section";
import { SectionHeading } from "./SectionHeading";
import { ScrollReveal } from "./ScrollReveal";

/**
 * 「AI が下ごしらえ、確定は人」— Ledra の AI 自動化でできることを 1 セクションに集約。
 *
 * 各項目は Standard プラン以上 + opt-in（既定 OFF）で有効化する auto-actions に対応。
 * 金額確定・本人確認・証明書発行など責任の伴う操作は必ず人が最終確認する（壁3）。
 * 配線の一次情報: docs/ai-automation-guide.md §4.5。
 */

const ITEMS = [
  {
    title: "LINE連携で、お客様対応を半自動化",
    description:
      "答えの決まっている質問は、登録ナレッジをもとに自動で即返信。価格の問い合わせには概算見積りをその場で返します。",
    points: ["営業時間・駐車場など定型質問は完全自動で返信", "見積書・請求書などの帳票も顧客のLINEへ自動送付"],
    icon: <ChatIcon />,
  },
  {
    title: "予約は、AIが自動で下書き",
    description: "LINEやメールの本文から、顧客・車両・作業内容を読み取って予約を自動起票。受信箱に下書きが並びます。",
    points: ["受信メッセージから予約候補を自動抽出", "本人確認・金額の確定は人が最終チェック"],
    icon: <CalendarIcon />,
  },
  {
    title: "作業後のアフターフォローも、自動で",
    description:
      "施工内容に応じて、メンテナンス時期（施工後6/12ヶ月など）のリマインドを自動送信。文面は顧客ごとにAIがパーソナライズします。",
    points: ["作業内容に合わせたフォローアップを自動送信", "オプトアウトにも対応"],
    icon: <BellIcon />,
  },
  {
    title: "証明書の発行は、撮影と確定ボタンだけ",
    description: "案件が完了すると証明書の下書きをAIが自動生成。写真の品質・改ざんも自動でチェックします。",
    points: ["文面の下書き・写真監査まで自動", "人がやるのは撮影と最終確定（発行）だけ"],
    icon: <CertIcon />,
  },
  {
    title: "見積書・請求書を、自動で作成",
    description:
      "案件の完了や会計工程への到達をきっかけに、請求書を自動で下書き。LINEの価格問い合わせからは見積書も自動起票します。",
    points: ["帳票の作成・下書きを自動化", "送付前の金額確定は必ず人が確認"],
    icon: <DocIcon />,
  },
];

export function AiAutomationSection() {
  return (
    <Section bg="alt" id="ai-automation">
      <SectionHeading
        title="AIが下ごしらえ、確定は人。"
        subtitle="お客様対応から予約・アフターフォロー・帳票作成まで、繰り返しの入力はAIが肩代わり。責任の伴う操作だけを人が確認します。"
      />

      <div className="mx-auto max-w-6xl grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5">
        {ITEMS.map((item, i) => (
          <ScrollReveal key={item.title} variant="fade-up" delay={(i % 3) * 80} className="h-full">
            <div className="h-full rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6 md:p-7 hover:bg-white/[0.05] hover:border-white/[0.14] transition-all duration-300 flex flex-col">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10 text-blue-400">
                {item.icon}
              </div>
              <h3 className="mt-4 text-lg font-bold leading-snug text-white">{item.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-white/90">{item.description}</p>
              <ul className="mt-4 space-y-2">
                {item.points.map((p) => (
                  <li key={p} className="flex items-start gap-2 text-xs leading-relaxed text-white/80">
                    <svg
                      className="mt-0.5 h-3 w-3 flex-shrink-0 text-blue-400"
                      viewBox="0 0 12 12"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M2 6l3 3 5-6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    {p}
                  </li>
                ))}
              </ul>
            </div>
          </ScrollReveal>
        ))}
      </div>

      <ScrollReveal variant="fade-in" delay={240}>
        <p className="mx-auto mt-10 max-w-2xl text-center text-xs leading-relaxed text-white/60">
          金額の確定・本人確認・証明書の発行など、責任の伴う操作は必ず人が最終確認します。 AI自動化は Standard
          プラン以上で、機能ごとにオン/オフを選べます。
        </p>
      </ScrollReveal>
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/* Icons — サイト既存の inline SVG（stroke ベース）に揃える */
/* ------------------------------------------------------------------ */

function iconProps() {
  return {
    className: "h-5 w-5",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
}

function ChatIcon() {
  return (
    <svg {...iconProps()}>
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg {...iconProps()}>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg {...iconProps()}>
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.7 21a2 2 0 0 1-3.4 0" />
    </svg>
  );
}

function CertIcon() {
  return (
    <svg {...iconProps()}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6M9 13l2 2 4-4" />
    </svg>
  );
}

function DocIcon() {
  return (
    <svg {...iconProps()}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6M8 13h8M8 17h5" />
    </svg>
  );
}
