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
  title: "車検証OCR・二次元コードスキャン",
  description:
    "電子車検証の二次元コードをカメラでスキャン、またはAI OCRで画像解析。車両情報の入力工数をゼロに近づける Ledra の自動読取機能です。",
  alternates: { canonical: "/features/vehicle-ocr" },
};

const problems = [
  {
    title: "手入力ミスが施工証明書の品質を下げる",
    desc: "車台番号・型式・ナンバーを手で打つと、1文字の転記ミスが後の保険請求や二次流通で問題になります。入力者が変わるたびにミスの確率は上がります。",
  },
  {
    title: "毎回15分かかる書類入力",
    desc: "「この車なんだっけ」と車検証を引き出しから探して、確認して、打ち込む。1件で済む作業でも、繁忙期に10台重なると1.5時間が消えます。",
  },
  {
    title: "紙の車検証はそもそも全体像が把握しにくい",
    desc: "車検証には20以上の項目が小さな文字で記載されています。必要なフィールドだけを正確に拾う作業は、慣れた担当者でも負担です。",
  },
];

const ocrFlowSteps = [
  {
    step: "1",
    title: "カメラで二次元コードを読む",
    desc: "施工受付時にスマートフォンのカメラを電子車検証の二次元コードにかざします。ZXingライブラリがリアルタイムで複数のQRコードを同時検出し、数秒でデコードします。",
  },
  {
    step: "2",
    title: "MLIT規格に沿ってパース",
    desc: "国土交通省「電子車検証 二次元コード記載項目一覧（2023.1版）」に準拠した専用パーサが、登録番号・車台番号・型式・有効期間・燃料種別などを構造化データとして抽出します。",
  },
  {
    step: "3",
    title: "QRで取れない項目はAI OCRで補完",
    desc: "メーカー名・車両寸法・重量など、二次元コードの仕様外の項目は Claude Vision が画像から直接読み取り、QRのデータとマージします。どちらが取れても最大限に活用します。",
  },
  {
    step: "4",
    title: "フォームに自動入力",
    desc: "「メーカー・型式・ナンバー・車台番号・サイズクラス・有効期間」がフォームに即反映されます。担当者は内容を確認して「次へ」を押すだけです。",
  },
];

const techCards = [
  {
    title: "QR2 と QR3 を同時に読む",
    description:
      "電子車検証には二次元コード2（登録番号・車台番号）と二次元コード3（型式・有効期間・燃料等）の2枚が印刷されています。Ledra は画像を複数領域に分割して両方を検出し、マージします。",
  },
  {
    title: "画像解析フォールバック",
    description:
      "二次元コードが読めない（汚れ・角度・紙の車検証）場合は Claude Vision OCR が自動で起動します。施工店はリトライ操作なしに、どちらの車検証でも使えます。",
  },
  {
    title: "サイズクラスを自動判定",
    description:
      "長さ・幅・高さ（mm）の寸法から体積を計算し、SS / S / M / L / LL / XL の施工サイズクラスに自動分類します。証明書の料金計算にそのまま使われます。",
  },
  {
    title: "サーバーサイド処理で安全",
    description:
      "画像・QRテキストはサーバーで処理し、Claude Vision への送信も API ルート経由です。ブラウザには車両情報のみが返るため、APIキーはクライアントに露出しません。",
  },
];

const sourceComparison = [
  {
    source: "二次元コード（QR）",
    accuracy: "最高精度",
    speed: "数秒",
    coverage: "登録番号・車台番号・型式・有効期間・燃料種別",
    note: "公式MLIT仕様準拠データ。メーカー・寸法は含まれない",
  },
  {
    source: "Claude Vision OCR",
    accuracy: "高精度",
    speed: "3〜5秒",
    coverage: "全項目（メーカー・型式・寸法・重量・排気量等）",
    note: "紙の車検証・古い車検証でも対応。QRを補完する形で動作",
  },
  {
    source: "ハイブリッド（QR＋OCR）",
    accuracy: "最高カバレッジ",
    speed: "3〜6秒",
    coverage: "QRの正確なデータ＋OCRで補完した全フィールド",
    note: "デフォルト動作。QR優先でOCR結果とマージ",
  },
];

export default function VehicleOcrPage() {
  return (
    <>
      <Breadcrumbs
        items={[
          { name: "機能", url: "/features" },
          { name: "車検証OCR", url: "/features/vehicle-ocr" },
        ]}
      />
      <PageHero
        badge="FEATURE › 車検証OCR"
        title="車検証を撮るだけで、車両情報が入る。"
        subtitle="電子車検証の二次元コードをカメラでスキャン、またはAI OCRで解析。登録番号・車台番号・型式・有効期間をフォームに自動入力します。手入力ゼロ、転記ミスゼロ。"
      />

      {/* Problems */}
      <Section bg="alt">
        <SectionHeading
          title="手入力が積み重ねる、小さなロス"
          subtitle="1台あたり数分の節約が、月間の業務効率に直結します。"
        />
        <FeatureGrid className="mt-10">
          {problems.map((p, i) => (
            <FeatureCard key={p.title} variant="bordered" title={p.title} description={p.desc} delay={i * 70} />
          ))}
        </FeatureGrid>
      </Section>

      {/* Flow */}
      <Section>
        <SectionHeading
          title="スキャンから自動入力まで"
          subtitle="操作はカメラを向けるだけ。残りはLedraが処理します。"
        />
        <div className="mx-auto mt-10 max-w-3xl space-y-4">
          {ocrFlowSteps.map((s, i) => (
            <ScrollReveal key={s.step} variant="fade-up" delay={i * 60}>
              <div className="flex items-start gap-5 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6 md:p-7">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500/20 to-blue-500/10 text-sm font-bold text-blue-300 border border-blue-500/20">
                  {s.step}
                </div>
                <div>
                  <h3 className="text-[1.063rem] font-bold text-white leading-snug">{s.title}</h3>
                  <p className="mt-2 text-[0.938rem] leading-[1.85] text-white">{s.desc}</p>
                </div>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </Section>

      {/* Source comparison table */}
      <Section bg="alt">
        <SectionHeading title="3つの解析モード" subtitle="車検証の状態に応じて、最適な方法が自動で選ばれます。" />
        <ScrollReveal variant="fade-up">
          <div className="mx-auto mt-10 max-w-5xl overflow-x-auto rounded-2xl border border-white/[0.08]">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-white/[0.08] bg-white/[0.04]">
                  <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-wider text-white">
                    解析モード
                  </th>
                  <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-wider text-white">
                    精度
                  </th>
                  <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-wider text-white">
                    速度
                  </th>
                  <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-wider text-white">
                    取得項目
                  </th>
                </tr>
              </thead>
              <tbody>
                {sourceComparison.map((row, i) => (
                  <tr
                    key={row.source}
                    className={`border-b border-white/[0.05] ${i === 2 ? "bg-blue-500/[0.04]" : "bg-white/[0.02]"}`}
                  >
                    <td className="px-5 py-4">
                      <p className="font-semibold text-white">{row.source}</p>
                      <p className="mt-0.5 text-[0.75rem] text-white">{row.note}</p>
                    </td>
                    <td className="px-5 py-4 text-white">{row.accuracy}</td>
                    <td className="px-5 py-4 font-mono text-blue-300">{row.speed}</td>
                    <td className="px-5 py-4 text-[0.813rem] leading-relaxed text-white">{row.coverage}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ScrollReveal>
      </Section>

      {/* Tech cards */}
      <Section>
        <SectionHeading title="設計のポイント" subtitle="現場での確実な動作を優先した実装です。" />
        <FeatureGrid className="mt-10">
          {techCards.map((c, i) => (
            <FeatureCard key={c.title} title={c.title} description={c.description} delay={i * 50} />
          ))}
        </FeatureGrid>
      </Section>

      {/* Before/After numbers */}
      <Section bg="alt">
        <SectionHeading title="入力工数の削減" subtitle="1台あたりの省力化が積み重なって、月間の作業量を変えます。" />
        <div className="mx-auto mt-10 max-w-3xl grid grid-cols-1 sm:grid-cols-3 gap-5">
          {[
            { label: "手入力時間", before: "約 15 分 / 台", after: "約 1 分 / 台", unit: "確認のみ" },
            { label: "転記ミス率", before: "担当者依存", after: "ほぼゼロ", unit: "MLIT公式データを直接使用" },
            { label: "月 100 台の場合", before: "25 時間消費", after: "1.7 時間", unit: "削減分を施工時間へ" },
          ].map((item) => (
            <ScrollReveal key={item.label} variant="fade-up">
              <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6">
                <p className="text-[0.75rem] font-semibold uppercase tracking-wider text-white">{item.label}</p>
                <p className="mt-3 text-sm text-white line-through">{item.before}</p>
                <p className="mt-1 text-2xl font-bold text-blue-300">{item.after}</p>
                <p className="mt-1 text-[0.688rem] text-white">{item.unit}</p>
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
            question="古い紙の車検証（電子化前）でも使えますか？"
            answer="はい、使えます。電子車検証の二次元コードがない場合は自動的に Claude Vision OCR が起動し、印字された文字を直接読み取ります。ただし、紙の車検証は文字が小さく汚れがある場合があるため、OCR精度は電子車検証に比べてやや低くなることがあります。"
          />
          <FAQItem
            question="軽自動車にも対応していますか？"
            answer="はい。登録車（普通車・小型車）と検査対象軽自動車の両方に対応しています。軽自動車の電子車検証は2025年4月から二次元コードに対応しており、Ledraはこれを読み取れます。"
          />
          <FAQItem
            question="画像はどこに保存されますか？"
            answer="スキャン・アップロードされた画像はサーバー側でのみ処理され、永続保存はされません。証明書に紐付けるのは解析後の構造化データのみです。"
          />
          <FAQItem
            question="カメラへのアクセス許可が必要ですか？"
            answer="カメラスキャンモードはブラウザのカメラアクセス許可が必要です。許可できない場合は「画像をアップロード」ボタンで同等の機能を利用できます。"
          />
          <FAQItem
            question="国土交通省の車検証閲覧APIとの関係は？"
            answer="現在 Ledra は二次元コードパース＋Claude Vision の組み合わせで車両情報を取得しています。国土交通省の車検証閲覧APIが利用可能になり次第、API → 二次元コード → OCR の優先順でフォールバックする形に拡張予定です。"
          />
        </FAQList>
      </Section>

      <CTABanner
        title="入力の手間を、施工の時間へ。"
        subtitle="車検証を撮るだけで車両情報が揃う、Ledra の施工証明書発行を試してみてください。"
        primaryLabel="無料で試す"
        primaryHref="/signup"
        secondaryLabel="機能一覧に戻る"
        secondaryHref="/features#vehicle"
        trackLocation="vehicle-ocr-cta"
      />
    </>
  );
}
