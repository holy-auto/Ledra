import { PageHero } from "@/components/marketing/PageHero";
import { Breadcrumbs } from "@/components/marketing/Breadcrumbs";
import { Section } from "@/components/marketing/Section";
import { SectionHeading } from "@/components/marketing/SectionHeading";
import { FeatureGrid } from "@/components/marketing/FeatureGrid";
import { FeatureCard } from "@/components/marketing/FeatureCard";
import { FAQList } from "@/components/marketing/FAQList";
import { FAQItem } from "@/components/marketing/FAQItem";
import { CTABanner } from "@/components/marketing/CTABanner";
import { ScrollReveal } from "@/components/marketing/ScrollReveal";

export const metadata = {
  title: "サービス履歴タイムライン",
  description:
    "証明書・予約・作業・NFC書込をひとつの時系列に。一台の車に何が行われたかを、関わった全員が1画面で確認できる車両パスポートの中核機能です。",
  alternates: { canonical: "/features/timeline" },
};

const problems = [
  {
    title: "「この車、前に何した？」が毎回調査になる",
    desc: "証明書はストレージ、予約はカレンダー、作業メモはExcel。バラバラのシステムに散らばったデータを人が拾い集めないと、一台の履歴が把握できない。",
  },
  {
    title: "担当者が変わると脈絡が消える",
    desc: "ベテランスタッフが退職するたびに、その車のコンテキストも一緒に消えてしまう。メモに頼った引き継ぎは、施工品質の劣化に直結します。",
  },
  {
    title: "顧客・保険会社への説明に時間がかかる",
    desc: "「いつ、何を施工したか」を聞かれるたびに、複数のシステムをまたいで情報を引き出して、口頭や書面で整理して伝える。この作業が現場の時間を削ります。",
  },
];

const timelineEvents = [
  {
    type: "cert",
    color: "rgba(59,130,246,",
    icon: "📋",
    label: "施工証明書",
    date: "2024-11-15",
    title: "ガラスコーティング 5年",
    detail: "施工店: プレミアムコート東京 / 担当: 田中",
    badge: "Polygon 検証済み",
    badgeColor: "green",
  },
  {
    type: "reservation",
    color: "rgba(168,85,247,",
    icon: "📅",
    label: "予約",
    date: "2025-03-01",
    title: "コーティングメンテナンス 予約",
    detail: "担当: 田中 / 10:00〜12:00",
    badge: "完了",
    badgeColor: "blue",
  },
  {
    type: "cert",
    color: "rgba(59,130,246,",
    icon: "📋",
    label: "施工証明書",
    date: "2025-03-01",
    title: "コーティングメンテナンス",
    detail: "施工店: プレミアムコート東京",
    badge: "Polygon 検証済み",
    badgeColor: "green",
  },
  {
    type: "nfc",
    color: "rgba(34,197,94,",
    icon: "📡",
    label: "NFC書込",
    date: "2025-03-01",
    title: "NFCタグを更新",
    detail: "証明書IDを NFC タグ #A3F2 に書き込み",
    badge: null,
    badgeColor: null,
  },
  {
    type: "cert",
    color: "rgba(245,158,11,",
    icon: "📋",
    label: "施工証明書",
    date: "2025-06-10",
    title: "PPF フロントフード",
    detail: "施工店: フィルムプロ横浜",
    badge: "Polygon 検証済み",
    badgeColor: "green",
  },
];

const sourceTypes = [
  {
    color: "blue",
    label: "施工証明書",
    desc: "発行されたすべての施工証明書（有効・無効・複製を含む）が時系列に表示されます。",
  },
  {
    color: "purple",
    label: "予約・作業",
    desc: "予約受付・チェックイン・作業進捗・完了報告が証明書と同じタイムラインに合成されます。",
  },
  {
    color: "green",
    label: "NFC書込",
    desc: "NFCタグへの書き込み操作も記録。『いつ、どのタグに証明書を書いたか』が追跡可能です。",
  },
  {
    color: "amber",
    label: "他店の施工",
    desc: "Ledra を使う別の施工店の記録も、同一車両として集約表示できます（車台番号でマッチング）。",
  },
];

const features = [
  {
    title: "無限スクロールの時系列表示",
    description:
      "最新のイベントを上に、古いものを下に。スクロールするほど車両の歴史が見えてくる直感的なUI。ページネーションなし。",
  },
  {
    title: "イベント種別フィルター",
    description: "「証明書のみ」「予約のみ」「NFC操作のみ」など、見たい種別だけに絞り込んで表示できます。",
  },
  {
    title: "クイックプレビュー",
    description:
      "タイムライン上のカードをタップすると、ページ遷移なしに施工内容・写真・証明書の詳細がプレビュー表示されます。",
  },
  {
    title: "施工店間で共有（車台番号マッチング）",
    description:
      "同じ車が複数の施工店でLedraを利用している場合、車台番号をキーに履歴が自動マージされます。一台のフルヒストリーが一画面に。",
  },
  {
    title: "次回メンテナンス予測",
    description:
      "最後の施工日からコーティングや定期点検の推奨タイミングを算出し、タイムライン上に表示。リマインダー送信の起点にもなります。",
  },
  {
    title: "監査ログとの連動",
    description:
      "誰がいつタイムラインを閲覧・操作したかも記録。保険会社からの照会に対し、アクセスログを証拠として提示できます。",
  },
];

export default function TimelinePage() {
  return (
    <>
      <Breadcrumbs
        items={[
          { name: "機能", url: "/features" },
          { name: "サービス履歴タイムライン", url: "/features/timeline" },
        ]}
      />
      <PageHero
        badge="FEATURE › 履歴タイムライン"
        title="一台の車に、起きたことが全部ある。"
        subtitle="証明書・予約・作業・NFC書込を一本の時系列に合成。この車に誰が・いつ・何をしたかが、1画面で把握できます。担当者が変わっても、文脈は消えません。"
      />

      {/* Problems */}
      <Section bg="alt">
        <SectionHeading
          title="履歴の断片化が、現場の判断を遅らせる"
          subtitle="施工の記録はあっても、それを参照するのに時間がかかれば意味が薄れます。"
        />
        <FeatureGrid className="mt-10">
          {problems.map((p, i) => (
            <FeatureCard key={p.title} variant="bordered" title={p.title} description={p.desc} delay={i * 70} />
          ))}
        </FeatureGrid>
      </Section>

      {/* Timeline mockup */}
      <Section>
        <SectionHeading
          title="タイムラインで見る、一台の歴史"
          subtitle="証明書・予約・NFC書込が、車ごとに1本の時系列に集約されます。"
        />
        <ScrollReveal variant="fade-up">
          <div className="mx-auto mt-10 max-w-lg">
            {/* Vehicle header */}
            <div className="rounded-2xl border border-white/[0.1] bg-white/[0.03] p-5 mb-6">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-500/10 border border-blue-500/20 text-2xl">
                  🚗
                </div>
                <div>
                  <p className="text-base font-bold text-white">トヨタ アルファード</p>
                  <p className="text-xs text-white font-mono mt-0.5">品川 300 あ 12-34</p>
                </div>
              </div>
              <div className="mt-4 flex gap-2 flex-wrap">
                {["証明書のみ", "予約のみ", "すべて"].map((label, i) => (
                  <button
                    key={label}
                    className={`rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
                      i === 2
                        ? "border-blue-500/40 bg-blue-500/10 text-blue-300"
                        : "border-white/[0.1] bg-white/[0.03] text-white"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Timeline */}
            <div className="relative">
              {/* Vertical line */}
              <div className="absolute left-[19px] top-2 bottom-2 w-px bg-white/[0.08]" />

              <div className="space-y-4">
                {timelineEvents.map((event, i) => (
                  <div key={i} className="flex items-start gap-4">
                    {/* Dot */}
                    <div
                      className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border text-base"
                      style={{
                        background: `${event.color}0.12)`,
                        borderColor: `${event.color}0.3)`,
                      }}
                    >
                      {event.icon}
                    </div>

                    {/* Content */}
                    <div className="flex-1 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span
                              className="text-[0.625rem] font-semibold uppercase tracking-wider"
                              style={{ color: `${event.color}0.9)` }}
                            >
                              {event.label}
                            </span>
                            <span className="text-[0.625rem] text-white font-mono">{event.date}</span>
                          </div>
                          <p className="mt-1 text-sm font-semibold text-white">{event.title}</p>
                          <p className="mt-0.5 text-xs text-white">{event.detail}</p>
                        </div>
                        {event.badge && (
                          <span
                            className={`shrink-0 text-[0.563rem] font-medium px-2 py-0.5 rounded-full border ${
                              event.badgeColor === "green"
                                ? "bg-green-500/10 border-green-500/20 text-green-300"
                                : "bg-blue-500/10 border-blue-500/20 text-blue-300"
                            }`}
                          >
                            {event.badge}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <p className="mt-4 text-center text-xs text-white">車両タイムラインの表示例（イメージ）</p>
          </div>
        </ScrollReveal>
      </Section>

      {/* Source types */}
      <Section bg="alt">
        <SectionHeading
          title="4種類のイベントが、ひとつの流れに"
          subtitle="これまで別々のシステムにあったデータが、車ごとに統合されます。"
        />
        <div className="mx-auto mt-10 max-w-3xl grid grid-cols-1 sm:grid-cols-2 gap-5">
          {sourceTypes.map((s, i) => (
            <ScrollReveal key={s.label} variant="fade-up" delay={i * 60}>
              <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6">
                <div className="flex items-center gap-3 mb-3">
                  <div
                    className={`h-2 w-2 rounded-full ${
                      s.color === "blue"
                        ? "bg-blue-400"
                        : s.color === "purple"
                          ? "bg-purple-400"
                          : s.color === "green"
                            ? "bg-green-400"
                            : "bg-amber-400"
                    }`}
                  />
                  <h3 className="text-sm font-bold text-white">{s.label}</h3>
                </div>
                <p className="text-sm leading-relaxed text-white">{s.desc}</p>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </Section>

      {/* Features */}
      <Section>
        <SectionHeading
          title="タイムラインの機能"
          subtitle="ただ表示するだけでなく、参照・共有・起点として使える設計です。"
        />
        <FeatureGrid className="mt-10">
          {features.map((f, i) => (
            <FeatureCard key={f.title} title={f.title} description={f.description} delay={i * 40} />
          ))}
        </FeatureGrid>
      </Section>

      {/* Who benefits */}
      <Section bg="alt">
        <SectionHeading title="誰が、どう使うか" subtitle="施工店から保険会社まで、役割に応じた参照ができます。" />
        <div className="mx-auto mt-10 max-w-4xl grid grid-cols-1 md:grid-cols-3 gap-5">
          {[
            {
              role: "施工店スタッフ",
              color: "rgba(59,130,246,",
              points: [
                "来店前に前回施工の内容を確認",
                "次のメンテナンス提案のトリガーに",
                "担当者の引き継ぎ時のコンテキスト共有",
              ],
            },
            {
              role: "保険会社",
              color: "rgba(168,85,247,",
              points: [
                "請求案件に紐付く施工履歴を一括確認",
                "ブロックチェーン検証済みの記録のみ参照",
                "査定に必要な情報を1画面で完結",
              ],
            },
            {
              role: "顧客・車両オーナー",
              color: "rgba(34,197,94,",
              points: [
                "「この車に何が施工されているか」を即確認",
                "売却時に購入希望者に見せる",
                "次のメンテナンスの目安を把握",
              ],
            },
          ].map((item, idx) => (
            <ScrollReveal key={item.role} variant="fade-up" delay={idx * 70}>
              <div
                className="rounded-2xl border p-6 h-full"
                style={{
                  borderColor: `${item.color}0.25)`,
                  background: `${item.color}0.05)`,
                }}
              >
                <p
                  className="text-xs font-semibold uppercase tracking-wider mb-4"
                  style={{ color: `${item.color}0.9)` }}
                >
                  {item.role}
                </p>
                <ul className="space-y-2">
                  {item.points.map((pt) => (
                    <li key={pt} className="flex items-start gap-2 text-sm text-white">
                      <span
                        className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
                        style={{ background: `${item.color}0.8)` }}
                      />
                      {pt}
                    </li>
                  ))}
                </ul>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </Section>

      {/* FAQ */}
      <Section>
        <SectionHeading title="よくあるご質問" />
        <FAQList>
          <FAQItem
            question="他の施工店の記録も見えてしまうのでは？"
            answer="いいえ。タイムラインは自テナント（施工店）が発行した証明書のみを表示するのが基本です。他店との履歴合算は、双方のテナントが明示的に許可した場合のみ（車台番号マッチング機能を有効にした場合）に表示されます。"
          />
          <FAQItem
            question="過去の紙の施工証明書を取り込めますか？"
            answer="CSVインポートまたは手動入力で過去の施工記録を登録し、タイムラインに追加できます。ただし、インポート済みの記録はブロックチェーンアンカリングの対象外となる場合があります。"
          />
          <FAQItem
            question="1台あたりのイベント数に上限はありますか？"
            answer="上限はありません。数年・数十件の施工・予約・NFC操作があっても、すべてタイムラインで閲覧可能です。古いデータは自動でアーカイブし、必要に応じてスクロールで遡れます。"
          />
          <FAQItem
            question="タイムラインは顧客にも見せられますか？"
            answer="はい。顧客ポータルにはその顧客の車両タイムラインの要約が表示されます。表示する項目のコントロール（施工内容のみ・写真の表示可否等）は施工店側が設定できます。"
          />
        </FAQList>
      </Section>

      <CTABanner
        title="一台の履歴を、全員が同じ場所で見る。"
        subtitle="担当者が変わっても、別の施工店に行っても。Ledra に記録されていれば、文脈は消えません。"
        primaryLabel="無料で試す"
        primaryHref="/signup"
        secondaryLabel="機能一覧に戻る"
        secondaryHref="/features#vehicle"
        trackLocation="timeline-cta"
      />
    </>
  );
}
