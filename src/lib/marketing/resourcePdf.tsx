/**
 * Marketing resource PDFs — generated server-side via @react-pdf/renderer.
 *
 * Add new PDFs by exporting a Document component and registering it in
 * `RESOURCE_PDFS` below. The API route `/api/marketing/resources/[key]/pdf`
 * reads the registry.
 */

import React from "react";
import { existsSync } from "node:fs";
import path from "node:path";
import { Document, Page, Text, View, StyleSheet, Font, Image, type DocumentProps } from "@react-pdf/renderer";
import {
  PLANS,
  TEMPLATE_OPTIONS,
  TEMPLATE_ADDITIONAL_WORK,
  ANNUAL_DISCOUNT_PERCENT,
  ADD_ON_OPTIONS,
  NFC_TAG_PRICING,
  LAUNCH_CAMPAIGN,
  FEATURE_COMPARISON,
} from "@/lib/marketing/pricing";
import { FEATURE_GROUPS, type FeatureGroup } from "@/lib/marketing/features";
import { listContent, type ContentEntry } from "@/lib/marketing/content";
import { notoSansJpDataUrl } from "@/lib/marketing/pdfFonts";
import { OPERATION_GUIDE_GROUPS, type GuideGroup } from "@/lib/operationGuides";
import { GLOSSARY_CATEGORIES, listGlossaryByCategory, type GlossaryCategory } from "@/lib/marketing/glossary";

let fontsRegistered = false;
function ensureFonts() {
  if (fontsRegistered) return;
  Font.register({
    family: "NotoSansJP",
    fonts: [
      { src: notoSansJpDataUrl(400), fontWeight: 400 },
      { src: notoSansJpDataUrl(700), fontWeight: 700 },
    ],
  });
  // react-pdf の既定は英単語を音節で割ってハイフンを挿す。日本語にこれが効くと
  // 「QRコードで-顧客に即共有」のように**本文中にハイフンが生える**。
  // 単語を割らない実装に差し替える（折り返し位置は行分割側が決める）。
  Font.registerHyphenationCallback((word) => [word]);
  fontsRegistered = true;
}

/* ──────────────────────────────────────────────────────────────
 * 文字の安全網
 *
 * `public/fonts/NotoSansJP-*.ttf` は**日本語サブセット**（7,466 グリフ）で、
 * 記号の収録が薄い。グリフの無い文字を流すと .notdef ＝ 豆腐になり、
 * PDF を開くまで誰も気づかない。実際、料金プランの機能別比較表は
 * `FEATURE_COMPARISON` の `✓` が全部豆腐だった。
 *
 * 対策は2層:
 *   1. ここで、無いと分かっている文字を収録済みの字に置き換える
 *   2. `__tests__/resourcePdf.render.test.tsx` が全8資料の描画文字列を走査し、
 *      グリフの無い文字が1つでも残っていたら落とす（新しい記号を足した時に気づける）
 *
 * `FEATURE_COMPARISON` や `GLOSSARY` は web 側とも共有しているデータで、
 * ブラウザでは `✓` も `μ` も普通に出る。**元データは触らず、PDF に入る手前で
 * だけ置き換える**のがこの関数の役割。
 * ────────────────────────────────────────────────────────────── */

/** サブセットに無い文字 → 収録されている代替。追加時はテストが検出する。 */
const GLYPH_FALLBACKS: Record<string, string> = {
  "✓": "あり", // 比較表の「対応」印。非対応の "—" と対で読める語にする
  "→": "»", // U+2192 は非収録。U+00BB は収録済み
  "①": "1.",
  "②": "2.",
  "③": "3.",
  "※": "*",
  "₂": "2", // SiO₂ → SiO2
  μ: "µ", // GREEK SMALL MU (U+03BC) は非収録、MICRO SIGN (U+00B5) は収録済み。見た目は同じ
};

const GLYPH_FALLBACK_RE = new RegExp(`[${Object.keys(GLYPH_FALLBACKS).join("")}]`, "g");

/**
 * 絵文字を落とす。`Extended_Pictographic` だけでは足りない ―― 国旗
 * (`🇯🇵` = 地域表示記号2つ)、キーキャップ (`1️⃣` = 数字 + FE0F + 20E3)、
 * 肌色 (`👍🏽` の `🏽`) は別プロパティで、落とし残すとそこだけ豆腐になる。
 */
const EMOJI_CHARS = /[\p{Extended_Pictographic}\p{Emoji_Modifier}\p{Regional_Indicator}‍️⃣]/gu;

/** PDF に流す文字列は必ずこれを通す。絵文字を落とし、非収録の記号を置き換える。 */
export function pdfSafe(s: string): string {
  return s
    .replace(EMOJI_CHARS, "")
    .replace(GLYPH_FALLBACK_RE, (c) => GLYPH_FALLBACKS[c] ?? c)
    .replace(/[ 　]{2,}/g, " ")
    .replace(/「\s+/g, "「")
    .trim();
}

/**
 * PDF パレット。globals.css のライトテーマ・トークンを引いている。
 * 独自色を足さない ―― サイト本体と紙面の印象を一致させるのが目的。
 *
 * **地と面の役割だけ、意図的に web と逆にしている。**
 * web は `--bg-base #f5f5f7` の上に `--bg-surface-solid #ffffff` のカードを置くが、
 * 紙では地がA4全面を覆うため、そのままだと**刷るたびに全面が薄いグレーになる**
 * （トナーを食い、プリンタによっては帯が出る）。地を白、カードを `#f5f5f7` の
 * 淡いトーンにして、印刷したときに情報の区切りだけがインクを使う形にする。
 */
const colors = {
  bg: "#ffffff", // 紙の地。web の --bg-base とは役割を入れ替えている（上記）
  surface: "#f5f5f7", // カード・表ヘッダの面。web の --bg-base の値
  text: "#1d1d1f", // --text-primary
  body: "#424247", // --text-secondary（本文）
  mute: "#555560", // --text-ink2（2番手テキストが沈むのを防ぐ中間階調）
  mute2: "#6e6e73", // --text-muted（フッタ・注記）
  accent: "#0071e3", // --accent-blue
  accent2: "#8944ab", // --accent-violet-text（白地で読める violet）
  gold: "#b08d3f", // --accent-gold（章扉・格式の差し色。全面ゴールド化はしない）
  border: "#d9d9d9", // --border-strong rgba(0,0,0,0.15) を白地に合成した値
};

const styles = StyleSheet.create({
  /**
   * 版面は A4 横（842×595pt）。提案書として投影する前提で横位置にし、
   * かつ A4 に余白なく刷れる形にしている（16:9 だと紙に帯が出る）。
   * 縦位置より天地が 34% 狭く左右が 46% 広いので、余白は左右を厚く取り、
   * 天地は詰める。
   */
  page: {
    fontFamily: "NotoSansJP",
    backgroundColor: colors.bg,
    color: colors.text,
    paddingHorizontal: 56,
    paddingTop: 42,
    paddingBottom: 54,
  },
  pageTitle: {
    fontSize: 9,
    fontWeight: 700,
    color: colors.accent,
    marginBottom: 8,
    letterSpacing: 3,
  },
  h1: {
    fontSize: 32,
    fontWeight: 700,
    lineHeight: 1.2,
    marginBottom: 14,
    letterSpacing: -0.4,
    color: colors.text,
  },
  h2: {
    fontSize: 15,
    fontWeight: 700,
    marginTop: 18,
    marginBottom: 8,
    color: colors.text,
  },
  lead: {
    fontSize: 13,
    color: colors.mute,
    lineHeight: 1.65,
    marginBottom: 14,
    // 横位置は行長が伸びすぎると読みにくい。リード文だけ行長を制限する。
    maxWidth: 620,
  },
  body: {
    fontSize: 10.5,
    color: colors.body,
    lineHeight: 1.75,
    marginBottom: 8,
  },
  card: {
    backgroundColor: colors.surface,
    border: `1pt solid ${colors.border}`,
    borderRadius: 7,
    padding: 14,
    marginVertical: 5,
  },
  cardTitle: {
    fontSize: 12,
    fontWeight: 700,
    marginBottom: 4,
    color: colors.text,
  },
  cardDesc: {
    fontSize: 10,
    color: colors.mute,
    lineHeight: 1.6,
  },
  grid2: {
    flexDirection: "row",
    gap: 16,
  },
  gridItem: {
    flex: 1,
  },
  /**
   * 章扉のルール。全幅の暗いトラックの上に、左端 64pt だけアクセント色を乗せる
   * （`borderLeft` を色付きセグメントとして使うことで、View 1つで二色帯にしている）。
   */
  gradientBar: {
    height: 4,
    backgroundColor: colors.border,
    borderLeftWidth: 88,
    borderLeftColor: colors.accent,
    marginBottom: 20,
  },
  footer: {
    position: "absolute",
    bottom: 24,
    left: 56,
    right: 56,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: 0.5,
    borderTopColor: colors.border,
    paddingTop: 8,
    fontSize: 8,
    color: colors.mute2,
  },
  tagline: {
    marginTop: 24,
    paddingLeft: 14,
    borderLeftWidth: 3,
    borderLeftColor: colors.gold,
    fontSize: 17,
    fontWeight: 700,
    lineHeight: 1.45,
    color: colors.accent2,
  },
  bullet: {
    fontSize: 10.5,
    color: colors.body,
    lineHeight: 1.7,
    marginBottom: 4,
    paddingLeft: 14,
  },
  priceLine: {
    flexDirection: "row",
    alignItems: "baseline",
    marginTop: 4,
    marginBottom: 6,
  },
  priceMain: {
    fontSize: 18,
    fontWeight: 700,
    color: colors.text,
  },
  priceUnit: {
    fontSize: 9,
    color: colors.mute2,
    marginLeft: 4,
  },
  planDesc: {
    fontSize: 9.5,
    color: colors.mute,
    marginBottom: 6,
    lineHeight: 1.55,
  },
  pill: {
    alignSelf: "flex-start",
    fontSize: 7.5,
    fontWeight: 700,
    letterSpacing: 1,
    color: colors.bg,
    backgroundColor: colors.accent,
    borderRadius: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginBottom: 7,
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border,
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  tableHead: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.accent,
    paddingVertical: 6,
    paddingHorizontal: 8,
    marginTop: 8,
  },
  th: {
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: 0.6,
    color: colors.mute,
  },
  td: {
    fontSize: 9.5,
    color: colors.body,
    lineHeight: 1.5,
  },
  col1: { flex: 2 },
  col2: { flex: 1, textAlign: "right" },
});

/**
 * 「更新: YYYY年M月D日」。**呼ぶたびに評価する**こと。
 * モジュールスコープの定数にすると Node プロセスが生きている限り値が固定され、
 * 「常に最新版が出る」はずの資料のフッターだけが起動日で止まる。
 */
function updatedLabel(): string {
  return new Date().toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric" });
}

/* ────────────────────────────────────────────────────────── */

/**
 * ページ番号は react-pdf の `render` に採番させる。
 *
 * 以前は各ページが `pageLabel="3 / 5"` を自前で持っていたが、中身が A4 に
 * 収まらず溢れると勝手に改ページが入り、実物 6 ページの資料が「5」と刷る
 * 状態になっていた（料金プラン詳細・ROI テンプレートで実際に発生）。
 * 総数を数えるのをやめれば、機能やオプションが増えて溢れても番号は正しい。
 */
function Footer() {
  return (
    <View style={styles.footer} fixed>
      <Text>Ledra | 自動車整備・コーティング店の施工履歴プラットフォーム</Text>
      <Text fixed render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages} · 更新: ${updatedLabel()}`} />
    </View>
  );
}

function Page1Cover() {
  return (
    <Page size="A4" orientation="landscape" style={styles.page}>
      <Text style={styles.pageTitle}>SERVICE OVERVIEW</Text>
      <View style={styles.gradientBar} />
      <Text style={styles.h1}>記録を、業界の共通言語にする。</Text>
      <Text style={styles.lead}>
        Ledra
        は、自動車整備・鈑金塗装・コーティング・PPF施工店向けの施工履歴プラットフォームです。予約・作業管理から、施工・整備履歴の記録、改ざん検知付きの施工証明書発行、請求・帳票、顧客管理、保険会社連携までをAIで一本化します。
      </Text>
      <Text style={styles.lead}>
        施工店・代理店・保険会社・顧客の4ポータルが、同じ「施工の事実」を役割に応じて閲覧・検証できる設計により、業界全体の記録文化を一段引き上げます。
      </Text>

      <View style={[styles.card, { marginTop: 26 }]} wrap={false}>
        <Text style={styles.cardTitle}>本日お話しすること</Text>
        <Text style={styles.bullet}>01. 課題 — いま、施工現場の記録に起きていること</Text>
        <Text style={styles.bullet}>02. 解決 — Ledra が現場の1日をどう変えるか</Text>
        <Text style={styles.bullet}>03. 信頼 — 「あとから直していない」を証明する技術</Text>
        <Text style={styles.bullet}>04. 導入 — 始め方と、伴走の中身</Text>
      </View>

      <Text style={styles.tagline}>自動車整備・コーティング店の施工履歴プラットフォーム — Ledra</Text>
      <Footer />
    </Page>
  );
}

function Page2Problems() {
  return (
    <Page size="A4" orientation="landscape" style={styles.page}>
      <Text style={styles.pageTitle}>01 PROBLEM</Text>
      <View style={styles.gradientBar} />
      <Text style={styles.h1}>いま、施工現場の記録に起きていること</Text>
      <Text style={styles.lead}>
        職人の仕事は確かでも、その確かさを「あとから証明できない」という課題が業界全体に残っています。
      </Text>

      <View style={styles.card} wrap={false}>
        <Text style={styles.cardTitle}>01 伝わらない摩擦</Text>
        <Text style={styles.cardDesc}>
          紙・個人スマホ・Excel に散在する施工記録。同じ精度で顧客・保険会社・次の担当者に届ける共通フォーマットがない。
        </Text>
      </View>
      <View style={styles.card} wrap={false}>
        <Text style={styles.cardTitle}>02 消える摩擦</Text>
        <Text style={styles.cardDesc}>
          紙はなくなり、担当者は変わる。3年後に「この車両に何の施工をしたか」を確実に答えられる記録が残っていない。
        </Text>
      </View>
      <View style={styles.card} wrap={false}>
        <Text style={styles.cardTitle}>03 疑われる摩擦</Text>
        <Text style={styles.cardDesc}>
          事故や事後対応の場面で、「本当にその時の写真か」「あとから直していないか」という不信に、紙やスマホ写真では十分答えられない。
        </Text>
      </View>

      <Text style={[styles.lead, { marginTop: 18 }]}>
        Ledra はこの3つの摩擦を、記録の「かたち」だけを変えることで解きます。
      </Text>

      <Footer />
    </Page>
  );
}

function Page3Features() {
  return (
    <Page size="A4" orientation="landscape" style={styles.page}>
      <Text style={styles.pageTitle}>02 WHAT IT DELIVERS</Text>
      <View style={styles.gradientBar} />
      <Text style={styles.h1}>Ledra が提供するもの</Text>
      <Text style={styles.lead}>施工証明だけではありません。現場の1日の時間の形全体を穏やかに更新します。</Text>

      <CardGrid
        items={[
          {
            title: "デジタル施工証明書",
            desc: "写真・施工内容・施工者・日時を、ワンクリックで発行。QRコードで顧客に即共有。",
          },
          {
            title: "保険・代理店連携",
            desc: "保険会社ポータルで検索・査定・案件管理。代理店ポータルで紹介・コミッション管理。",
          },
          { title: "車両・顧客 360° ビュー", desc: "1台・1人の履歴を、証明書・予約・請求までタイムラインで横断参照。" },
          {
            title: "改ざん防止（Polygon anchoring / C2PA）",
            desc: "施工写真の SHA-256 ハッシュを Polygon に刻印。写真には C2PA 署名も付与。第三者が独立に検証可能。",
          },
          {
            title: "案件ワークフロー・POS・帳票",
            desc: "受付から引渡しまでを1つのワークスペースで。Tap to Pay 決済、請求書 PDF 自動生成、Google Calendar 同期。",
          },
          {
            title: "既存ツールとの連携",
            desc: "Stripe / Square / Google Calendar / LINE、freee・マネーフォワードの会計連携と接続。置き換えではなく、橋渡し。",
          },
          {
            title: "現場モバイル",
            desc: "スマホ・タブレット前提の UI で、撮影から証明書発行までを現場の速度で。PWA 対応で通信が不安定な場所でも動きます。",
          },
          {
            title: "経営分析・ナレッジ",
            desc: "売上・顧客・パートナーランクをダッシュボードで可視化。施工手順のナレッジ共有で、品質を人ではなくチームに残します。",
          },
        ]}
      />

      <Footer />
    </Page>
  );
}

function Page4NextSteps() {
  return (
    <Page size="A4" orientation="landscape" style={styles.page}>
      <Text style={styles.pageTitle}>04 NEXT STEPS</Text>
      <View style={styles.gradientBar} />
      <Text style={styles.h1}>次のステップ</Text>
      <Text style={styles.lead}>無料プランから始められます。導入支援・トレーニングは担当チームが伴走します。</Text>

      <Text style={styles.h2}>導入プログラム（標準4〜6週間）</Text>
      <Text style={styles.bullet}>1. キックオフ・業務棚卸し（1週目）</Text>
      <Text style={styles.bullet}>2. データ移行・メニュー登録（1〜2週目）</Text>
      <Text style={styles.bullet}>3. テナント初期設定（2週目）</Text>
      <Text style={styles.bullet}>4. 現場トレーニング（3週目）</Text>
      <Text style={styles.bullet}>5. ローンチ・運用定着（4週目以降）</Text>

      <Text style={styles.h2}>ご相談の窓口</Text>
      <Text style={styles.body}>Web: https://ledra.co.jp/contact</Text>
      <Text style={styles.body}>Email: info@ledra.co.jp</Text>
      <Text style={styles.body}>資料一覧: https://ledra.co.jp/resources</Text>
      <Text style={styles.body}>ROIシミュレーター: https://ledra.co.jp/roi</Text>

      <Text style={[styles.tagline, { marginTop: 40 }]}>記録を、業界の共通言語にする。</Text>
      <Text style={[styles.body, { color: colors.mute2, marginTop: 4 }]}>— Ledra チーム</Text>

      <Footer />
    </Page>
  );
}

function PageTrust() {
  return (
    <Page size="A4" orientation="landscape" style={styles.page}>
      <Text style={styles.pageTitle}>03 TRUST</Text>
      <View style={styles.gradientBar} />
      <Text style={styles.h1}>「あとから直していない」を、第三者が確かめられる</Text>
      <Text style={styles.lead}>
        記録が信用されるかどうかは、発行元の主張ではなく、第三者が独立に検証できるかで決まります。Ledra
        は写真そのものと、写真が存在した時刻の両方に証拠を残します。
      </Text>

      <CardGrid
        items={[
          {
            title: "写真に出自を焼き込む（C2PA）",
            desc: "撮影・編集の履歴を含む署名付きコンテンツクレデンシャルを写真に埋め込む。SNS 等で再配布されても出自を追跡できます。",
          },
          {
            title: "ハッシュをブロックチェーンに刻む（Polygon）",
            desc: "施工写真の SHA-256 ハッシュを Polygon に記録。Ledra 側のデータが差し替えられても、チェーン上の記録との差分で検知できます。",
          },
          {
            title: "編集履歴が残る",
            desc: "証明書への編集は差分付きで保存。「誰が、いつ、何を変えたか」を後から確認できます。",
          },
          {
            title: "発行元を署名で示す",
            desc: "ECDSA P-256 の署名情報を証明書に付与。発行元の同一性を Ledra Verify API で検証できます。",
          },
        ]}
      />

      <Text style={[styles.cardDesc, { marginTop: 10 }]}>
        ＊ 証明書コンテンツ全体のハッシュ刻印と日次バッチ Merkle はコントラクトを準備済み、配線はロードマップ対応です。
      </Text>

      <Footer />
    </Page>
  );
}

export function ServiceOverviewPdf() {
  ensureFonts();
  return (
    <Document
      title="Ledra サービス概要"
      author="Ledra"
      subject="自動車整備・コーティング店の施工履歴プラットフォーム サービス概要資料"
      creator="Ledra"
      producer="Ledra"
    >
      {Page1Cover()}

      {SectionDivider({
        no: "01",
        title: "課題",
        lead: "職人の仕事は確かでも、その確かさを「あとから証明できない」。この一点が、業界全体に3つの摩擦を生んでいます。",
      })}
      {Page2Problems()}

      {SectionDivider({
        no: "02",
        title: "解決",
        lead: "記録の「かたち」だけを変えます。やることは増やさず、現場の1日の流れはそのままに。",
      })}
      {Page3Features()}
      {/* 画面キャプチャは未取得ならページごと出ない（scripts/capture-screenshots.ts で取得） */}
      {ScreenshotSlide({
        eyebrow: "02 SCREEN — 証明書発行",
        title: "撮って、選んで、発行まで数分",
        lead: "施工写真と作業内容を選ぶだけ。テンプレートは店舗ごとにブランド設定済みなので、体裁を整える手間がありません。",
        points: [
          "写真は撮影時点で C2PA 署名とハッシュ化",
          "発行と同時に QR・URL・NFC の3経路で共有可能",
          "テンプレートは店舗のロゴ・配色を反映",
        ],
        file: "admin/certs-new.png",
        caption: "施工店ポータル / 証明書の新規発行",
      })}
      {ScreenshotSlide({
        eyebrow: "02 SCREEN — 顧客 360°",
        title: "1台・1人の履歴が、1画面に集まる",
        lead: "証明書・予約・請求・車両をタイムラインで横断参照。担当が変わっても、履歴は途切れません。",
        points: [
          "「あの車にいつ何をしたか」を探す時間が消える",
          "車検・再施工の提案根拠がその場で出せる",
          "退職・代替わりでも記録が個人に紐づかない",
        ],
        file: "admin/customers-detail.png",
        caption: "施工店ポータル / 顧客の 360° ビュー",
      })}
      {ScreenshotSlide({
        eyebrow: "02 SCREEN — 保険会社連携",
        title: "査定側も、同じ事実を見る",
        lead: "保険会社は自分のポータルから証明書を検索・照会できます。FAX や PDF の往復が要りません。",
        points: [
          "車両単位で過去の施工・修理履歴を照会",
          "写真の改ざん検知結果も同じ画面で確認",
          "見える範囲は RLS で役割ごとに自動で絞り込み",
        ],
        file: "insurer/search.png",
        caption: "保険会社ポータル / 証明書の検索",
      })}

      {SectionDivider({
        no: "03",
        title: "信頼",
        lead: "記録が信用されるかどうかは、発行元の主張ではなく、第三者が独立に検証できるかで決まります。",
      })}
      {PageTrust()}

      {SectionDivider({
        no: "04",
        title: "導入",
        lead: "無料プランから始められます。データ移行も現場トレーニングも、担当チームが伴走します。",
      })}
      {Page4NextSteps()}
    </Document>
  );
}

/* ══════════════════════════════════════════════════════════════════
 * Pricing Overview — 料金プラン詳細資料
 * ══════════════════════════════════════════════════════════════════ */

function PricingCover() {
  return (
    <Page size="A4" orientation="landscape" style={styles.page}>
      <Text style={styles.pageTitle}>PRICING OVERVIEW</Text>
      <View style={styles.gradientBar} />
      <Text style={styles.h1}>料金プラン詳細</Text>
      <Text style={styles.lead}>
        Ledra
        の各プランに含まれる機能・対応件数・サポート範囲・オプション料金・キャンペーン情報を、見積提示にそのまま使える粒度でまとめた一次資料です。
      </Text>

      <View style={[styles.card, { marginTop: 18 }]} wrap={false}>
        <Text style={styles.cardTitle}>この資料の構成</Text>
        <Text style={styles.bullet}>
          • {Object.keys(PLANS).length}プラン（
          {Object.values(PLANS)
            .map((p) => p.name)
            .join(" / ")}
          ）の料金と上限
        </Text>
        <Text style={styles.bullet}>• 機能別比較表（{FEATURE_COMPARISON.length}項目）</Text>
        <Text style={styles.bullet}>• ブランド証明書テンプレートのオプション料金</Text>
        <Text style={styles.bullet}>• 追加店舗・ユーザー・サポート等のオプション料金</Text>
        <Text style={styles.bullet}>• NFCタグ価格と初期100店舗限定キャンペーン</Text>
      </View>

      <View style={[styles.card, { marginTop: 12 }]} wrap={false}>
        <Text style={styles.cardTitle}>料金の基本方針</Text>
        <Text style={styles.cardDesc}>
          ・すべて月額税抜表示（別途消費税）。年間契約で{ANNUAL_DISCOUNT_PERCENT}%割引。{"\n"}
          ・証明書発行数はプラン上限内であれば追加料金なし。{"\n"}
          ・フリープランはクレジットカード登録不要でご利用いただけます。
        </Text>
      </View>

      <Text style={styles.tagline}>記録を、業界の共通言語にする。</Text>
      <Footer />
    </Page>
  );
}

function PlanCard({
  name,
  price,
  unit,
  annualPrice,
  annualUnit,
  setupFee,
  description,
  certLimit,
  features,
  recommended,
}: {
  name: string;
  price: string;
  unit: string;
  annualPrice?: string;
  annualUnit?: string;
  setupFee?: string;
  description: string;
  certLimit: string;
  features: readonly string[];
  recommended?: boolean;
}) {
  return (
    <View style={[styles.card, { padding: 12, marginVertical: 4 }]} wrap={false}>
      {recommended && <Text style={styles.pill}>RECOMMENDED</Text>}
      <Text style={styles.cardTitle}>{name}</Text>
      <View style={styles.priceLine}>
        <Text style={styles.priceMain}>{price}</Text>
        <Text style={styles.priceUnit}>{unit}</Text>
        {annualPrice && (
          <Text style={[styles.priceUnit, { marginLeft: 10 }]}>
            / 年間契約 {annualPrice}
            {annualUnit}
          </Text>
        )}
      </View>
      {setupFee && <Text style={[styles.cardDesc, { marginBottom: 4 }]}>初期費用: {setupFee}</Text>}
      <Text style={styles.planDesc}>{description}</Text>
      <Text style={[styles.cardDesc, { marginBottom: 4, color: colors.accent }]}>{certLimit}</Text>
      {features.map((f) => (
        <Text key={f} style={[styles.bullet, { fontSize: 9.5, marginBottom: 2 }]}>
          • {f}
        </Text>
      ))}
    </View>
  );
}

function PricingPlans() {
  return (
    <Page size="A4" orientation="landscape" style={styles.page}>
      <Text style={styles.pageTitle}>01 PLANS</Text>
      <View style={styles.gradientBar} />
      <Text style={styles.h1}>4プランの基本料金</Text>
      <Text style={[styles.lead, { marginBottom: 10 }]}>
        発行ボリュームと運用規模に合わせて選べる4プランです。年間契約で{ANNUAL_DISCOUNT_PERCENT}%割引が適用されます。
      </Text>

      <View style={styles.grid2}>
        <View style={styles.gridItem}>
          <PlanCard
            name={PLANS.free.name}
            price={PLANS.free.price}
            unit={PLANS.free.unit}
            description={PLANS.free.description}
            certLimit={PLANS.free.certLimit}
            features={PLANS.free.features}
          />
          <PlanCard
            name={PLANS.standard.name}
            price={PLANS.standard.price}
            unit={PLANS.standard.unit}
            annualPrice={PLANS.standard.annualPrice}
            annualUnit={PLANS.standard.annualUnit}
            setupFee={PLANS.standard.setupFee}
            description={PLANS.standard.description}
            certLimit={PLANS.standard.certLimit}
            features={PLANS.standard.features}
            recommended
          />
        </View>
        <View style={styles.gridItem}>
          <PlanCard
            name={PLANS.starter.name}
            price={PLANS.starter.price}
            unit={PLANS.starter.unit}
            annualPrice={PLANS.starter.annualPrice}
            annualUnit={PLANS.starter.annualUnit}
            description={PLANS.starter.description}
            certLimit={PLANS.starter.certLimit}
            features={PLANS.starter.features}
          />
          <PlanCard
            name={PLANS.pro.name}
            price={PLANS.pro.price}
            unit={PLANS.pro.unit}
            annualPrice={PLANS.pro.annualPrice}
            annualUnit={PLANS.pro.annualUnit}
            setupFee={PLANS.pro.setupFee}
            description={PLANS.pro.description}
            certLimit={PLANS.pro.certLimit}
            features={PLANS.pro.features}
          />
        </View>
      </View>

      <Footer />
    </Page>
  );
}

function PricingComparison() {
  return (
    <Page size="A4" orientation="landscape" style={styles.page}>
      <Text style={styles.pageTitle}>02 COMPARISON</Text>
      <View style={styles.gradientBar} />
      <Text style={styles.h1}>機能別比較表</Text>
      <Text style={[styles.lead, { marginBottom: 6 }]}>各プランで利用できる主要機能・上限を一覧にまとめました。</Text>

      <View style={styles.tableHead}>
        <Text style={[styles.th, { flex: 2.4 }]}>項目</Text>
        <Text style={[styles.th, { flex: 1, textAlign: "right" }]}>フリー</Text>
        <Text style={[styles.th, { flex: 1, textAlign: "right" }]}>スターター</Text>
        <Text style={[styles.th, { flex: 1.2, textAlign: "right" }]}>スタンダード</Text>
        <Text style={[styles.th, { flex: 1, textAlign: "right" }]}>プロ</Text>
      </View>
      {FEATURE_COMPARISON.map((row) => (
        <View key={row.feature} style={styles.tableRow}>
          <Text style={[styles.td, { flex: 2.4 }]}>{pdfSafe(row.feature)}</Text>
          <Text style={[styles.td, { flex: 1, textAlign: "right" }]}>{pdfSafe(row.free)}</Text>
          <Text style={[styles.td, { flex: 1, textAlign: "right" }]}>{pdfSafe(row.starter)}</Text>
          <Text style={[styles.td, { flex: 1.2, textAlign: "right" }]}>{pdfSafe(row.standard)}</Text>
          <Text style={[styles.td, { flex: 1, textAlign: "right" }]}>{pdfSafe(row.pro)}</Text>
        </View>
      ))}

      <Text style={[styles.h2, { marginTop: 22 }]}>料金の適用ルール</Text>
      <Text style={styles.bullet}>• 年間契約で{ANNUAL_DISCOUNT_PERCENT}%割引（月額換算比）。</Text>
      <Text style={styles.bullet}>• 上限超過は翌月以降の上位プラン移行を推奨。当月の発行停止はありません。</Text>
      <Text style={styles.bullet}>• プラン間のアップグレードはいつでも可能（日割り計算）。</Text>
      <Text style={styles.bullet}>• ダウングレードは次回更新時から適用されます。</Text>

      <Footer />
    </Page>
  );
}

function PricingTemplateAndAddons() {
  return (
    <Page size="A4" orientation="landscape" style={styles.page}>
      <Text style={styles.pageTitle}>03 TEMPLATE & OPTIONS</Text>
      <View style={styles.gradientBar} />
      <Text style={styles.h1}>テンプレートとオプション</Text>

      <Text style={styles.h2}>ブランド証明書テンプレート</Text>
      <View style={styles.grid2}>
        <View style={styles.gridItem}>
          <View style={styles.card} wrap={false}>
            <Text style={styles.cardTitle}>{TEMPLATE_OPTIONS.preset.name}</Text>
            <View style={styles.priceLine}>
              <Text style={styles.priceMain}>{TEMPLATE_OPTIONS.preset.price}</Text>
              <Text style={styles.priceUnit}>/ {TEMPLATE_OPTIONS.preset.unit}</Text>
            </View>
            <Text style={[styles.cardDesc, { marginBottom: 4 }]}>初期費用: {TEMPLATE_OPTIONS.preset.setupFee}</Text>
            <Text style={styles.planDesc}>{TEMPLATE_OPTIONS.preset.description}</Text>
            {TEMPLATE_OPTIONS.preset.features.map((f) => (
              <Text key={f} style={[styles.bullet, { fontSize: 9.5, marginBottom: 2 }]}>
                • {f}
              </Text>
            ))}
          </View>
        </View>
        <View style={styles.gridItem}>
          <View style={styles.card} wrap={false}>
            <Text style={styles.pill}>RECOMMENDED</Text>
            <Text style={styles.cardTitle}>{TEMPLATE_OPTIONS.custom.name}</Text>
            <View style={styles.priceLine}>
              <Text style={styles.priceMain}>{TEMPLATE_OPTIONS.custom.price}</Text>
              <Text style={styles.priceUnit}>/ {TEMPLATE_OPTIONS.custom.unit}</Text>
            </View>
            <Text style={[styles.cardDesc, { marginBottom: 4 }]}>初期費用: {TEMPLATE_OPTIONS.custom.setupFee}</Text>
            <Text style={styles.planDesc}>{TEMPLATE_OPTIONS.custom.description}</Text>
            {TEMPLATE_OPTIONS.custom.features.map((f) => (
              <Text key={f} style={[styles.bullet, { fontSize: 9.5, marginBottom: 2 }]}>
                • {f}
              </Text>
            ))}
          </View>
        </View>
      </View>

      <Text style={styles.h2}>テンプレート追加作業費</Text>
      <View style={styles.tableHead}>
        <Text style={[styles.th, styles.col1]}>作業内容</Text>
        <Text style={[styles.th, styles.col2]}>料金</Text>
      </View>
      {TEMPLATE_ADDITIONAL_WORK.map((r) => (
        <View key={r.item} style={styles.tableRow}>
          <Text style={[styles.td, styles.col1]}>{r.item}</Text>
          <Text style={[styles.td, styles.col2]}>{r.price}</Text>
        </View>
      ))}

      <Text style={styles.h2}>追加オプション</Text>
      <View style={styles.tableHead}>
        <Text style={[styles.th, styles.col1]}>オプション</Text>
        <Text style={[styles.th, styles.col2]}>料金</Text>
      </View>
      {Object.values(ADD_ON_OPTIONS).map((opt) => {
        const hasPack = "packPrice" in opt && opt.packPrice;
        const price = hasPack
          ? `${opt.price}${opt.unit}（${opt.packPrice}${opt.packUnit}パック）`
          : `${opt.price}${opt.unit}`;
        return (
          <View key={opt.name} style={styles.tableRow}>
            <Text style={[styles.td, styles.col1]}>{opt.name}</Text>
            <Text style={[styles.td, styles.col2]}>{price}</Text>
          </View>
        );
      })}

      <Footer />
    </Page>
  );
}

function PricingCampaignAndNfc() {
  return (
    <Page size="A4" orientation="landscape" style={styles.page}>
      <Text style={styles.pageTitle}>04 NFC & CAMPAIGN</Text>
      <View style={styles.gradientBar} />
      <Text style={styles.h1}>NFCタグ & キャンペーン</Text>

      <Text style={styles.h2}>NFCタグ価格</Text>
      <Text style={styles.body}>
        各テナントには初回 {NFC_TAG_PRICING.freeAllocation} 枚まで無償で配布します（追加購入はパック単位）。
      </Text>
      <View style={styles.tableHead}>
        <Text style={[styles.th, styles.col1]}>枚数</Text>
        <Text style={[styles.th, styles.col2]}>価格</Text>
      </View>
      {NFC_TAG_PRICING.packs.map((p) => (
        <View key={p.quantity} style={styles.tableRow}>
          <Text style={[styles.td, styles.col1]}>{p.quantity}枚パック</Text>
          <Text style={[styles.td, styles.col2]}>{p.price}</Text>
        </View>
      ))}

      <Text style={[styles.h2, { marginTop: 24 }]}>初期{LAUNCH_CAMPAIGN.maxSlots}店舗限定キャンペーン</Text>
      <View style={styles.card} wrap={false}>
        <Text style={styles.cardTitle}>適用条件</Text>
        <Text style={styles.bullet}>• 対象プラン: {LAUNCH_CAMPAIGN.plans.map((p) => PLANS[p].name).join(" / ")}</Text>
        <Text style={styles.bullet}>• 対象枠: 先着 {LAUNCH_CAMPAIGN.maxSlots} 店舗</Text>
        <Text style={styles.bullet}>• 適用期間: 初年度のみ（{LAUNCH_CAMPAIGN.durationMonths}ヶ月）</Text>
        <Text style={styles.bullet}>
          • NFCタグ初回配布数: {LAUNCH_CAMPAIGN.nfcFreeAllocation} 枚（通常 {NFC_TAG_PRICING.freeAllocation} 枚）
        </Text>
      </View>
      <Text style={[styles.cardDesc, { marginTop: 6 }]}>{LAUNCH_CAMPAIGN.description}</Text>

      <Text style={[styles.h2, { marginTop: 20 }]}>見積・契約に関する補足</Text>
      <Text style={styles.bullet}>• 表記はすべて税抜（別途消費税10%）。</Text>
      <Text style={styles.bullet}>• 請求は月末締め・翌月末払い。クレジットカードまたは口座振替にて承ります。</Text>
      <Text style={styles.bullet}>• 大規模導入・グループ法人・業種特化オプションは別途お見積りいたします。</Text>

      <Footer />
    </Page>
  );
}

export function PricingOverviewPdf() {
  ensureFonts();
  return (
    <Document
      title="Ledra 料金プラン詳細"
      author="Ledra"
      subject="Ledra 料金プラン・オプション・キャンペーン詳細"
      creator="Ledra"
      producer="Ledra"
    >
      {PricingCover()}

      {SectionDivider({
        no: "01",
        title: "プラン",
        lead: "発行ボリュームと運用規模で選ぶ4プラン。含まれるもの・上限を、見積にそのまま使える粒度で並べます。",
      })}
      {PricingPlans()}
      {PricingComparison()}

      {SectionDivider({
        no: "02",
        title: "オプション",
        lead: "証明書テンプレートのブランド化と、店舗・ユーザー・サポートの追加。必要になったぶんだけ足せます。",
      })}
      {PricingTemplateAndAddons()}

      {SectionDivider({
        no: "03",
        title: "NFC とキャンペーン",
        lead: "現場でかざして呼び出す NFC タグの価格と、初期店舗限定の適用条件です。",
      })}
      {PricingCampaignAndNfc()}
    </Document>
  );
}

/* ══════════════════════════════════════════════════════════════════
 * Features Deep Dive — 機能紹介資料
 * ══════════════════════════════════════════════════════════════════ */

function FeaturesCover() {
  return (
    <Page size="A4" orientation="landscape" style={styles.page}>
      <Text style={styles.pageTitle}>FEATURES DEEP DIVE</Text>
      <View style={styles.gradientBar} />
      <Text style={styles.h1}>Ledra 機能紹介</Text>
      <Text style={styles.lead}>
        証明書発行から、車両・顧客管理、POS・帳票、経営分析、保険・代理店連携まで。Ledra
        の全機能を、役割横断でご紹介します。
      </Text>

      <View style={[styles.card, { marginTop: 18 }]} wrap={false}>
        <Text style={styles.cardTitle}>本資料の読み方</Text>
        {/* 件数はベタ書きにしない ―― 機能を1つ足した瞬間に資料が嘘をつくため。 */}
        <Text style={styles.bullet}>
          • {FEATURE_GROUPS.length}カテゴリ、合計{FEATURE_GROUPS.reduce((n, g) => n + g.features.length, 0)}
          の機能を、業務の順番に沿って並べています。
        </Text>
        <Text style={styles.bullet}>• Admin / Agent / Insurer / Customer の4ポータルで利用可能な機能を明示。</Text>
        <Text style={styles.bullet}>• 料金・契約条件は別紙「料金プラン詳細資料」をご参照ください。</Text>
      </View>

      <Text style={[styles.h2, { marginTop: 18 }]}>目次</Text>
      {FEATURE_GROUPS.map((g, i) => (
        <Text key={g.id} style={styles.bullet}>
          {String(i + 1).padStart(2, "0")}. {g.title} — {g.subtitle}
        </Text>
      ))}

      <Text style={styles.tagline}>記録を、業界の共通言語にする。</Text>
      <Footer />
    </Page>
  );
}

function FeaturesFourPortal() {
  return (
    <Page size="A4" orientation="landscape" style={styles.page}>
      <Text style={styles.pageTitle}>00 OVERVIEW</Text>
      <View style={styles.gradientBar} />
      <Text style={styles.h1}>ひとつの記録を、4ポータルで共有</Text>
      <Text style={styles.lead}>
        施工店・代理店・保険会社・顧客は、同じ「事実」を役割に応じた最適な形で受け取ります。
      </Text>

      <CardGrid
        items={[
          {
            title: "Admin（施工店）",
            desc: "証明書の発行・管理、車両・顧客、予約・作業・POS・請求、経営ダッシュボード。現場運用の中心。",
          },
          {
            title: "Agent（代理店）",
            desc: "施工店の紹介、コミッション管理、電子署名による契約締結、担当施工店のパフォーマンスレポート。",
          },
          {
            title: "Insurer（保険会社）",
            desc: "証明書の検索・照会、案件管理、地域別・パートナー別の集計分析。査定の一次資料として。",
          },
          {
            title: "Customer（顧客）",
            desc: "受け取った証明書をスマホで閲覧・共有。QR/URL/NFC の3経路でアクセス。車両の過去履歴も確認。",
          },
        ]}
      />

      <Text style={[styles.h2, { marginTop: 12 }]}>共通する設計思想</Text>
      <Text style={styles.bullet}>• 「記録は1つ・見え方は4つ」。同じ証明書を役割ごとに最適化して提示。</Text>
      <Text style={styles.bullet}>• RLS（行レベルセキュリティ）で、役割に応じて自動的に見える範囲を絞り込み。</Text>
      <Text style={styles.bullet}>• 4ポータル間の権限委譲・切替はワンクリック。テナント境界は常に明確。</Text>

      <Footer />
    </Page>
  );
}

function FeatureGroupPage({ group, index }: { group: FeatureGroup; index: number }) {
  return (
    <Page size="A4" orientation="landscape" style={styles.page}>
      <Text style={styles.pageTitle}>
        {String(index + 1).padStart(2, "0")} {group.title.toUpperCase()}
      </Text>
      <View style={styles.gradientBar} />
      <Text style={styles.h1}>{group.title}</Text>
      <Text style={[styles.lead, { marginBottom: 10 }]}>{group.subtitle}</Text>

      <CardGrid items={group.features.map((f) => ({ title: f.title, desc: f.description }))} />

      <Footer />
    </Page>
  );
}

function FeaturesClosing() {
  return (
    <Page size="A4" orientation="landscape" style={styles.page}>
      <Text style={styles.pageTitle}>{String(FEATURE_GROUPS.length + 1).padStart(2, "0")} NEXT STEPS</Text>
      <View style={styles.gradientBar} />
      <Text style={styles.h1}>次のステップ</Text>
      <Text style={styles.lead}>
        ご興味のある機能について、デモ画面とご一緒にご説明できます。30分のオンラインデモから承ります。
      </Text>

      <Text style={styles.h2}>確認のためのチェックリスト</Text>
      <Text style={styles.bullet}>• 現在の施工記録の保存方法（紙・Excel・他システム）</Text>
      <Text style={styles.bullet}>• 月間の施工件数・車両台数・主な車種</Text>
      <Text style={styles.bullet}>• 既に利用している会計・予約・決済ツール</Text>
      <Text style={styles.bullet}>• 保険会社・代理店との連携状況</Text>
      <Text style={styles.bullet}>• 現場スタッフのモバイル端末利用状況</Text>

      <Text style={[styles.h2, { marginTop: 18 }]}>よくいただくご質問</Text>
      <View style={styles.card} wrap={false}>
        <Text style={styles.cardTitle}>Q. 既存の顧客・車両データは移行できますか？</Text>
        <Text style={styles.cardDesc}>
          はい。CSV インポート機能で一括移行可能です。テンプレートをお渡ししますので、移行作業は平均
          1〜2日で完了します。
        </Text>
      </View>
      <View style={styles.card} wrap={false}>
        <Text style={styles.cardTitle}>Q. 現場スタッフへの教育はどのくらい必要ですか？</Text>
        <Text style={styles.cardDesc}>
          タブレット/スマホ前提の UI なので、初回 30 分のトレーニングで発行フローに慣れていただけます。
        </Text>
      </View>
      <View style={styles.card} wrap={false}>
        <Text style={styles.cardTitle}>Q. API や Webhook で自社システムと連携できますか？</Text>
        <Text style={styles.cardDesc}>
          プロプランで提供。テナント固有の API キー・Webhook
          エンドポイントで、証明書発行時などをリアルタイム連携可能です。
        </Text>
      </View>

      <Text style={[styles.h2, { marginTop: 18 }]}>ご相談窓口</Text>
      <Text style={styles.body}>Web: https://ledra.co.jp/contact</Text>
      <Text style={styles.body}>Email: info@ledra.co.jp</Text>
      <Text style={styles.body}>料金詳細: https://ledra.co.jp/pricing</Text>

      <Footer />
    </Page>
  );
}

export function FeaturesDeepDivePdf() {
  ensureFonts();
  return (
    <Document
      title="Ledra 機能紹介資料"
      author="Ledra"
      subject="Ledra の全機能をカテゴリ別に紹介する資料"
      creator="Ledra"
      producer="Ledra"
    >
      {FeaturesCover()}

      {SectionDivider({
        no: "01",
        title: "全体像",
        lead: "施工店・代理店・保険会社・顧客。4者が同じ「施工の事実」を、役割に応じた形で受け取ります。",
      })}
      {FeaturesFourPortal()}

      {/* カテゴリごとの章扉は付けない。カテゴリは FEATURE_GROUPS の増減で変わるので、
          章立てを固定すると新しいカテゴリが章の外に落ちる。ここは1つの章として通す。 */}
      {SectionDivider({
        no: "02",
        title: "機能",
        lead: "業務の順番に沿って、カテゴリごとに見ていきます。料金・契約条件は別紙「料金プラン詳細資料」をご参照ください。",
      })}
      {FEATURE_GROUPS.map((g, i) => (
        <React.Fragment key={g.id}>{FeatureGroupPage({ group: g, index: i })}</React.Fragment>
      ))}

      {SectionDivider({
        no: "03",
        title: "次のステップ",
        lead: "ご興味のある機能について、デモ画面とご一緒にご説明できます。",
      })}
      {FeaturesClosing()}
    </Document>
  );
}

/* ══════════════════════════════════════════════════════════════════
 * Security Whitepaper — セキュリティホワイトペーパー
 * ══════════════════════════════════════════════════════════════════ */

type SecurityBlock = {
  id: string;
  title: string;
  lead: string;
  items: { title: string; desc: string }[];
};

const SECURITY_BLOCKS: SecurityBlock[] = [
  {
    id: "encryption",
    title: "1. 暗号化",
    lead: "通信・保存・ペイロードの3層で、データを守ります。",
    items: [
      {
        title: "通信の暗号化 (TLS 1.2+)",
        desc: "アプリと API の全トラフィックを TLS で暗号化。Vercel の HTTPS 終端を使用し、HSTS を有効化しています。",
      },
      {
        title: "保存データの暗号化",
        desc: "Supabase Postgres はディスク暗号化 (AES-256) を実装。アプリ層のテナントシークレットは AES-256-GCM で暗号化保管し、運用ルールに沿って鍵ローテーション。オブジェクトストレージも転送時・保管時ともに暗号化。",
      },
      {
        title: "機微データのペッパリング",
        desc: "顧客認証に用いる電話番号末尾4桁などは、アプリレイヤで pepper 付きハッシュ化してから保存。DB 流出時にも生値が復元できない形に。",
      },
      {
        title: "Polygon anchoring",
        desc: "施工写真の SHA-256 ハッシュを Polygon ブロックチェーンに刻印。仮に DB 側の写真が差し替えられても、チェーン上のアンカーと突き合わせて不整合を即検知できます。",
      },
    ],
  },
  {
    id: "access-control",
    title: "2. アクセス制御",
    lead: "役割・テナント・セッション境界を、DB レベルで強制します。",
    items: [
      {
        title: "Row Level Security (RLS)",
        desc: "Supabase の RLS を全テーブルで有効化。テナント・役割・所有者の3軸で、SQL レイヤでアクセス可能な行を制限。",
      },
      {
        title: "役割ベースアクセス制御 (RBAC)",
        desc: "Owner / Admin / Staff / Viewer の4段階に加え、代理店・保険会社・顧客の独立したロール。必要最小限の権限のみを付与。",
      },
      {
        title: "多要素認証 (MFA) 対応",
        desc: "ポータルユーザー向けに、Supabase Auth の TOTP/SMS MFA を設定可能。",
      },
      {
        title: "セッション管理",
        desc: "顧客ポータルは pepper 付きハッシュで保存される独自セッショントークン (デフォルト 30 日)。代理店契約等の高セキュリティ操作には 1 回限りの署名付き URL (5 分有効) を別途発行。",
      },
      {
        title: "レート制限",
        desc: "Upstash Redis による分散レートリミット。ログイン・問合せ・API ごとに上限を設定し、ブルートフォース・スクレイピングを抑制。",
      },
    ],
  },
  {
    id: "backup",
    title: "3. バックアップ・可用性",
    lead: "喪失と停止に備え、復旧を既定の運用に。",
    items: [
      {
        title: "日次自動バックアップ",
        desc: "Supabase Postgres の日次自動バックアップ + ポイントインタイムリカバリ。誤削除から任意時点への復旧を可能にします。",
      },
      {
        title: "地理冗長配置",
        desc: "アプリケーションは Vercel の東京リージョンを主、グローバルエッジキャッシュを併用。大規模障害時も読み取りは継続可能。",
      },
      {
        title: "監視・アラート",
        desc: "Sentry による例外トラッキング、Vercel Analytics / Speed Insights による性能監視。Cron ジョブの失敗検知も自動化。",
      },
    ],
  },
  {
    id: "vulnerability",
    title: "4. 脆弱性対応",
    lead: "見つけ次第、直す。その運用を仕組みで。",
    items: [
      {
        title: "依存ライブラリの継続監視",
        desc: "GitHub Dependabot により CVE を日次監視。Critical は即時、High は 72 時間以内に対応する運用ルール。",
      },
      {
        title: "CI でのセキュリティチェック",
        desc: "ESLint の security ルール、Secret scanning、型チェックをプルリクエストごとに実行。マージ前に既知の問題を遮断。",
      },
      {
        title: "ログ監査",
        desc: "認証・証明書発行・無効化・顧客情報閲覧など、重要操作の監査ログを保存。異常操作の追跡が可能。",
      },
      {
        title: "脆弱性報告窓口",
        desc: "security@ledra.co.jp にてセキュリティ関連のご報告を受け付けます。ご連絡から3営業日以内に初期対応いたします。",
      },
    ],
  },
  {
    id: "tamper-prevention",
    title: "5. 改ざん防止",
    lead: "『記録を、業界の共通言語にする』ための根拠。",
    items: [
      {
        title: "証明書編集履歴",
        desc: "証明書への編集操作は差分付きで編集履歴に保存。『誰が、いつ、何を変えたか』を後から確認できます。",
      },
      {
        title: "C2PA 画像署名",
        desc: "施工写真を証明書と紐付ける際、C2PA 規格で署名付きのコンテンツクレデンシャルを埋め込み。SNS 等で再配布されても出自を追跡可能。",
      },
      {
        title: "Polygon anchoring",
        desc: "発行時に施工写真の SHA-256 ハッシュを Polygon に刻印。写真が差し替えられた場合、チェーン上のアンカーとの差分で検知できます (証明書本体ハッシュ・バッチ Merkle はロードマップ)。",
      },
      {
        title: "デジタル署名",
        desc: "証明書には ECDSA P-256 で生成した署名情報 (公開鍵フィンガープリント + verify URL) をメタデータとして付与。発行元の同一性を Ledra Verify API で検証可能。",
      },
    ],
  },
];

function SecurityCover() {
  return (
    <Page size="A4" orientation="landscape" style={styles.page}>
      <Text style={styles.pageTitle}>SECURITY WHITEPAPER</Text>
      <View style={styles.gradientBar} />
      <Text style={styles.h1}>Ledra セキュリティ ホワイトペーパー</Text>
      <Text style={styles.lead}>
        暗号化・アクセス制御・バックアップ・脆弱性対応・改ざん防止。
        記録の信頼を仕組みで守るための、技術担当者・情報セキュリティ担当者向け一次資料です。
      </Text>

      <View style={[styles.card, { marginTop: 16 }]} wrap={false}>
        <Text style={styles.cardTitle}>本資料の想定読者</Text>
        <Text style={styles.bullet}>• 情報システム部門・セキュリティ責任者</Text>
        <Text style={styles.bullet}>• 導入審査・監査対応を行う担当者</Text>
        <Text style={styles.bullet}>• 保険会社・代理店の技術対応窓口</Text>
      </View>

      <Text style={[styles.h2, { marginTop: 18 }]}>目次</Text>
      <Text style={styles.bullet}>00. セキュリティ3層モデル</Text>
      {SECURITY_BLOCKS.map((b) => (
        <Text key={b.id} style={styles.bullet}>
          {b.title} — {b.lead}
        </Text>
      ))}
      <Text style={styles.bullet}>06. Polygon anchoring フロー</Text>
      <Text style={styles.bullet}>07. データライフサイクル（保管・削除・テナント境界）</Text>
      <Text style={styles.bullet}>08. 認証取得状況・インシデント対応・窓口</Text>

      <Text style={styles.tagline}>記録の信頼を、仕組みで守る。</Text>
      <Footer />
    </Page>
  );
}

function SecurityLayers() {
  return (
    <Page size="A4" orientation="landscape" style={styles.page}>
      <Text style={styles.pageTitle}>00 LAYER MODEL</Text>
      <View style={styles.gradientBar} />
      <Text style={styles.h1}>セキュリティ3層モデル</Text>
      <Text style={styles.lead}>
        通信・保存・ペイロードの3層で、独立に働く防御を重ねています。どれか1層が突破されても、他の層で被害を局所化する設計です。
      </Text>

      <View style={styles.card} wrap={false}>
        <Text style={styles.cardTitle}>層1: 通信 (Transport)</Text>
        <Text style={styles.cardDesc}>
          TLS 1.2+ による経路全体の暗号化。HSTS により HTTPS ダウングレードを防止。内部サービス間も mTLS
          相当の境界で分離。
        </Text>
      </View>
      <View style={styles.card} wrap={false}>
        <Text style={styles.cardTitle}>層2: 保存 (At-Rest)</Text>
        <Text style={styles.cardDesc}>
          Postgres は AES-256
          によるディスク暗号化。オブジェクトストレージは転送時・保管時ともに暗号化。バックアップも同様の暗号化を継承。
        </Text>
      </View>
      <View style={styles.card} wrap={false}>
        <Text style={styles.cardTitle}>層3: ペイロード (Data-Level)</Text>
        <Text style={styles.cardDesc}>
          DB 内部の機微データにアプリ層のハッシュ化・pepper 適用を追加。DB
          管理者を含む全アクセス経路でも生値が復元できない形に。
        </Text>
      </View>

      <Text style={[styles.h2, { marginTop: 16 }]}>独立性の担保</Text>
      <Text style={styles.bullet}>• 各層の鍵は異なる KMS/Vault で管理、ローテーション周期も独立。</Text>
      <Text style={styles.bullet}>• ペイロード層のソルト/ペッパーはアプリケーションシークレットとしてのみ管理。</Text>
      <Text style={styles.bullet}>• 監査証跡は各層で独立に採取し、時刻同期のみ共通化。</Text>

      <Footer />
    </Page>
  );
}

function SecurityBlockPage({ block, index }: { block: SecurityBlock; index: number }) {
  return (
    <Page size="A4" orientation="landscape" style={styles.page}>
      <Text style={styles.pageTitle}>
        {String(index + 1).padStart(2, "0")} {block.title.replace(/^\d+\.\s*/, "").toUpperCase()}
      </Text>
      <View style={styles.gradientBar} />
      <Text style={styles.h1}>{block.title}</Text>
      <Text style={[styles.lead, { marginBottom: 10 }]}>{block.lead}</Text>

      {block.items.map((it) => (
        <View key={it.title} style={styles.card} wrap={false}>
          <Text style={styles.cardTitle}>{it.title}</Text>
          <Text style={styles.cardDesc}>{it.desc}</Text>
        </View>
      ))}

      <Footer />
    </Page>
  );
}

function SecurityPolygonFlow() {
  return (
    <Page size="A4" orientation="landscape" style={styles.page}>
      <Text style={styles.pageTitle}>06 POLYGON ANCHORING</Text>
      <View style={styles.gradientBar} />
      <Text style={styles.h1}>Polygon anchoring フロー</Text>
      <Text style={styles.lead}>施工写真ハッシュの刻印から、第三者による独立検証までの一連の流れです。</Text>

      <Text style={styles.h2}>発行フロー（書き込み側）</Text>
      <Text style={styles.bullet}>1. 施工写真を SHA-256 で確定値を算出（C2PA 署名と並行）。</Text>
      <Text style={styles.bullet}>
        2. ハッシュを Ledra の anchoring キューに投入。Polygon PoS の LedraAnchor コントラクトに送信。
      </Text>
      <Text style={styles.bullet}>
        3. トランザクションハッシュと block number を画像レコードに記録。UI の「ブロックチェーン検証済み」バッジが点灯。
      </Text>

      <Text style={styles.h2}>検証フロー（読み取り側）</Text>
      <Text style={styles.bullet}>1. 任意の第三者が施工写真と記録済みトランザクションを取得。</Text>
      <Text style={styles.bullet}>2. 手元で写真を SHA-256 ハッシュ化。</Text>
      <Text style={styles.bullet}>
        3. Polygon 上の LedraAnchor コントラクトを読み出し、ハッシュ一致を Polygonscan 等で確認。
      </Text>

      <View style={[styles.card, { marginTop: 10 }]} wrap={false}>
        <Text style={styles.cardTitle}>設計上の要点</Text>
        <Text style={styles.bullet}>• Ledra 側ストレージが改変されても、Polygon 上の記録との比較で検知可能。</Text>
        <Text style={styles.bullet}>• 写真そのものは C2PA 署名で独立検証。チェーン上にはハッシュのみ記録。</Text>
        <Text style={styles.bullet}>
          • 証明書コンテンツ全体のハッシュ刻印 (LedraCertAnchor) と日次バッチ Merkle (LedraBatchAnchor)
          はコントラクトを準備済み。配線はロードマップで対応。
        </Text>
      </View>

      <Footer />
    </Page>
  );
}

function SecurityDataLifecycle() {
  return (
    <Page size="A4" orientation="landscape" style={styles.page}>
      <Text style={styles.pageTitle}>07 DATA LIFECYCLE</Text>
      <View style={styles.gradientBar} />
      <Text style={styles.h1}>データライフサイクル</Text>
      <Text style={styles.lead}>テナントデータの取得から削除までの流れ・保管期間・権限境界を明示します。</Text>

      <Text style={styles.h2}>テナント境界</Text>
      <Text style={styles.bullet}>• 全ての業務テーブルに tenant_id を必須カラムとして設定。</Text>
      <Text style={styles.bullet}>• RLS ポリシーにより、SQL クエリは自動的に所属テナントのみに絞り込み。</Text>
      <Text style={styles.bullet}>
        • バックアップ単位もテナント識別子を残し、データエクスポート時は tenant_id フィルタを強制。
      </Text>

      <Text style={styles.h2}>保管期間</Text>
      <View style={styles.tableHead}>
        <Text style={[styles.th, styles.col1]}>データ種別</Text>
        <Text style={[styles.th, styles.col2]}>保管期間</Text>
      </View>
      <View style={styles.tableRow}>
        <Text style={[styles.td, styles.col1]}>証明書・施工写真</Text>
        <Text style={[styles.td, styles.col2]}>契約期間中 + 契約終了後 3 年</Text>
      </View>
      <View style={styles.tableRow}>
        <Text style={[styles.td, styles.col1]}>顧客個人情報（氏名・連絡先）</Text>
        <Text style={[styles.td, styles.col2]}>契約期間中 + 契約終了後 1 年</Text>
      </View>
      <View style={styles.tableRow}>
        <Text style={[styles.td, styles.col1]}>監査ログ</Text>
        <Text style={[styles.td, styles.col2]}>最低 5 年</Text>
      </View>
      <View style={styles.tableRow}>
        <Text style={[styles.td, styles.col1]}>自動バックアップ</Text>
        <Text style={[styles.td, styles.col2]}>最大 30 日（PITR）</Text>
      </View>

      <Text style={styles.h2}>データ削除・エクスポート</Text>
      <Text style={styles.bullet}>• 退会時はテナント単位で論理削除し、30 日後に物理削除。</Text>
      <Text style={styles.bullet}>• 個別の顧客情報削除依頼は、本人確認後 30 日以内に対応。</Text>
      <Text style={styles.bullet}>• 全データの CSV / JSON エクスポートは、Admin 権限者がいつでも取得可能。</Text>

      <Footer />
    </Page>
  );
}

function SecurityClosing() {
  return (
    <Page size="A4" orientation="landscape" style={styles.page}>
      <Text style={styles.pageTitle}>08 COMPLIANCE & CONTACT</Text>
      <View style={styles.gradientBar} />
      <Text style={styles.h1}>認証・インシデント対応・お問い合わせ</Text>

      <Text style={styles.h2}>認証取得状況</Text>
      <View style={styles.card} wrap={false}>
        <Text style={styles.cardTitle}>ISMS (ISO/IEC 27001)</Text>
        <Text style={styles.cardDesc}>
          取得準備中。取得時期は本ホワイトペーパーおよび /security ページにて告知します。
        </Text>
      </View>
      <View style={styles.card} wrap={false}>
        <Text style={styles.cardTitle}>プライバシーマーク</Text>
        <Text style={styles.cardDesc}>取得準備中。社内ポリシー整備・教育実施を先行して進めています。</Text>
      </View>

      <Text style={styles.h2}>インシデント対応フロー</Text>
      <Text style={styles.bullet}>1. 検知: Sentry / 監査ログ / 外部報告のいずれかでトリアージ開始。</Text>
      <Text style={styles.bullet}>
        2. 初期対応: 24 時間以内に影響範囲を確定、必要なら緊急措置（当該機能停止・鍵ローテーション）。
      </Text>
      <Text style={styles.bullet}>3. 連絡: 影響テナントには個別連絡、重大事象は公開インシデントレポートを発行。</Text>
      <Text style={styles.bullet}>4. 恒久対応: 根本原因分析（RCA）を実施、再発防止策をチェンジログに記録。</Text>

      <Text style={styles.h2}>お問い合わせ</Text>
      <Text style={styles.body}>セキュリティ報告: security@ledra.co.jp</Text>
      <Text style={styles.body}>技術問合せ: info@ledra.co.jp</Text>
      <Text style={styles.body}>Web: https://ledra.co.jp/security</Text>
      <Text style={[styles.cardDesc, { marginTop: 10 }]}>
        本資料は公開時点の情報で作成しています。認証取得の進捗・技術仕様の更新は /security
        ページおよび最新版ホワイトペーパーに反映します。
      </Text>

      <Footer />
    </Page>
  );
}

export function SecurityWhitepaperPdf() {
  ensureFonts();
  return (
    <Document
      title="Ledra セキュリティホワイトペーパー"
      author="Ledra"
      subject="Ledra のセキュリティ対策・データ保護・認証取得状況"
      creator="Ledra"
      producer="Ledra"
    >
      {SecurityCover()}

      {SectionDivider({
        no: "01",
        title: "守り方",
        lead: "通信・保存・ペイロードの3層で、独立に働く防御を重ねています。どれか1層が破られても、被害を局所化する設計です。",
      })}
      {SecurityLayers()}
      {SECURITY_BLOCKS.map((b, i) => (
        <React.Fragment key={b.id}>{SecurityBlockPage({ block: b, index: i })}</React.Fragment>
      ))}

      {SectionDivider({
        no: "02",
        title: "改ざん防止",
        lead: "写真ハッシュの刻印から、第三者による独立検証まで。Ledra 側のデータが変わっても検知できる根拠です。",
      })}
      {SecurityPolygonFlow()}

      {SectionDivider({
        no: "03",
        title: "データの扱い",
        lead: "テナント境界・保管期間・削除とエクスポート。預けたデータがどう扱われ、いつ消えるかを明示します。",
      })}
      {SecurityDataLifecycle()}

      {SectionDivider({
        no: "04",
        title: "体制",
        lead: "認証取得の進捗、インシデント時に何がどの順で起きるか、報告の窓口です。",
      })}
      {SecurityClosing()}
    </Document>
  );
}

/* ══════════════════════════════════════════════════════════════════
 * Case Studies — 導入事例集（パイロット版）
 * ══════════════════════════════════════════════════════════════════ */

function CasesCover() {
  return (
    <Page size="A4" orientation="landscape" style={styles.page}>
      <Text style={styles.pageTitle}>CASE STUDIES</Text>
      <View style={styles.gradientBar} />
      <Text style={styles.h1}>導入事例集（パイロット版）</Text>
      <Text style={styles.lead}>
        Ledra
        は正式サービスを開始したばかりです。本資料は、先行導入いただくパイロット企業様の事例をどのように記録・共有していくのか、そしてどんな指標で変化を語っていくのかを整理した、サービス現在地のスナップショットです。
      </Text>

      <View style={[styles.card, { marginTop: 14 }]} wrap={false}>
        <Text style={styles.cardTitle}>本資料の立ち位置</Text>
        <Text style={styles.bullet}>• 事例は随時アップデート。公開次第、本資料 v1.x として差し替えます。</Text>
        <Text style={styles.bullet}>• 現時点では、業界別の典型的な導入パターンと計測フレームを提示します。</Text>
        <Text style={styles.bullet}>• 実在の数値はパイロット企業様の同意取得後に順次反映します。</Text>
      </View>

      <View style={[styles.card, { marginTop: 10 }]} wrap={false}>
        <Text style={styles.cardTitle}>このドキュメントで得られる情報</Text>
        <Text style={styles.bullet}>• 事例で扱う定量・定性指標（6種類）</Text>
        <Text style={styles.bullet}>• 5業種（コーティング / フィルム / ラッピング / 板金 / 整備）での変化パターン</Text>
        <Text style={styles.bullet}>• パイロット参加の流れと、Ledra による伴走内容</Text>
        <Text style={styles.bullet}>• 事例取材・公開までのタイムライン</Text>
      </View>

      <Text style={styles.tagline}>あなたの1社目が、業界の記録文化を作る。</Text>
      <Footer />
    </Page>
  );
}

function CasesMetrics() {
  return (
    <Page size="A4" orientation="landscape" style={styles.page}>
      <Text style={styles.pageTitle}>01 METRICS</Text>
      <View style={styles.gradientBar} />
      <Text style={styles.h1}>事例で扱う指標</Text>
      <Text style={[styles.lead, { marginBottom: 10 }]}>
        Ledra
        の事例記事は、定量・定性の両面から現場の変化を捉えます。各パイロット企業様に合わせて、測る項目をあらかじめ合意の上で記録します。
      </Text>

      <Text style={styles.h2}>定量指標（before / after）</Text>
      <View style={styles.tableHead}>
        <Text style={[styles.th, styles.col1]}>指標</Text>
        <Text style={[styles.th, styles.col2]}>記録単位</Text>
      </View>
      <View style={styles.tableRow}>
        <Text style={[styles.td, styles.col1]}>証明書1件あたりの発行時間</Text>
        <Text style={[styles.td, styles.col2]}>分 / 件</Text>
      </View>
      <View style={styles.tableRow}>
        <Text style={[styles.td, styles.col1]}>過去施工の再問い合わせ対応時間</Text>
        <Text style={[styles.td, styles.col2]}>分 / 件</Text>
      </View>
      <View style={styles.tableRow}>
        <Text style={[styles.td, styles.col1]}>顧客ポータルでの自己閲覧率</Text>
        <Text style={[styles.td, styles.col2]}>%</Text>
      </View>
      <View style={styles.tableRow}>
        <Text style={[styles.td, styles.col1]}>月間証明書発行数</Text>
        <Text style={[styles.td, styles.col2]}>件 / 月</Text>
      </View>
      <View style={styles.tableRow}>
        <Text style={[styles.td, styles.col1]}>保険会社・代理店への情報連携時間</Text>
        <Text style={[styles.td, styles.col2]}>分 / 件</Text>
      </View>
      <View style={styles.tableRow}>
        <Text style={[styles.td, styles.col1]}>紙書類の保管ファイル数</Text>
        <Text style={[styles.td, styles.col2]}>冊</Text>
      </View>

      <Text style={styles.h2}>定性指標（スタッフ・顧客の声）</Text>
      <Text style={styles.bullet}>• 『あの車にいつ何をしたか』を探す時間・思考の変化</Text>
      <Text style={styles.bullet}>• 顧客への引渡し・説明時の空気の変化</Text>
      <Text style={styles.bullet}>• 新規顧客からの信頼獲得エピソード（QR/NFC 体験）</Text>
      <Text style={styles.bullet}>• 保険会社・代理店との連携における摩擦の減り方</Text>

      <Footer />
    </Page>
  );
}

type IndustryPattern = {
  industry: string;
  profile: string;
  before: string[];
  after: string[];
};

const INDUSTRY_PATTERNS: IndustryPattern[] = [
  {
    industry: "コーティング専門店",
    profile: "月間施工 30〜120件、スタッフ 2〜6名、保証書管理が課題。",
    before: [
      "紙の保証書を製本、顧客への再発行対応に担当者が取られる",
      "過去施工の確認電話が毎日数件、紙ファイルを漁る時間が積み上がる",
      "施工写真は個人スマホに散在、退職時にデータが消える",
    ],
    after: [
      "QR コードで顧客が自分の保証書・写真に即アクセス",
      "再発行問い合わせが減り、バックオフィスが施工に集中可能",
      "C2PA 署名で写真の出自が保証、SNS 掲載の信頼にも寄与",
    ],
  },
  {
    industry: "フィルム施工店",
    profile: "複数車種・複数メーカー、施工差分の記録が分析の鍵。",
    before: [
      "フィルム種別・施工面積の記録が Excel 依存でブレる",
      "UV/IR の測定値を残しても、顧客への証明手段がない",
      "代理店紹介案件の成果共有が口頭・メール",
    ],
    after: [
      "車両 360° ビューでフィルム種別・過去施工を即参照",
      "測定値・施工写真付き証明書を URL で即共有、広告素材にも",
      "代理店ポータルで成果を可視化、紹介元との信頼関係強化",
    ],
  },
  {
    industry: "ラッピング / カスタム",
    profile: "単価が高く、記録の品質が次回案件の獲得に直結。",
    before: [
      "施工過程の写真が膨大、顧客共有の方法が SNS 依存",
      "車両の過去ラッピング履歴が残らず、剥離・再施工の判断に時間",
      "イベント会場での商談時、実績を示す資料がその場で出せない",
    ],
    after: [
      "タイムライン＋写真付き証明書で、1台の歴史がそのままポートフォリオ",
      "NFC タグでその場で実績提示、イベント会場での商談速度が上がる",
      "顧客ごとの車両履歴が蓄積され、リピート提案の質が向上",
    ],
  },
  {
    industry: "板金・塗装",
    profile: "保険案件の比率が高く、代理店・保険会社との記録共有が命。",
    before: [
      "事故車の写真・修理内容を保険会社に都度 FAX/PDF で送付",
      "中古査定や再修理時に過去の板金箇所を証明する手段が乏しい",
      "代理店からの紹介経路の記録・コミッション計算が手作業",
    ],
    after: [
      "保険会社ポータルで修理証明を自動連携、査定時の往復が激減",
      "過去板金箇所が Polygon anchoring で第三者検証可能に",
      "代理店コミッション・紹介成果が自動集計、締め処理が効率化",
    ],
  },
  {
    industry: "整備・車検",
    profile: "定期来店の顧客基盤、履歴連続性が価値の源泉。",
    before: [
      "紙の整備記録簿の発行・保管に時間がかかる",
      "代替わり・担当変更で過去履歴の引き継ぎに抜けが出る",
      "車検時の見積根拠が口頭ベースで説得力に限界",
    ],
    after: [
      "デジタル整備証明書で発行時間短縮、写真付きで見積根拠が明確",
      "車両 360° ビューで担当変更でも履歴連続、顧客体験が安定",
      "車検後の顧客フォローを顧客ポータル経由で継続可能",
    ],
  },
];

function CasesIndustryPatternPage({ pattern, index }: { pattern: IndustryPattern; index: number }) {
  return (
    <Page size="A4" orientation="landscape" style={styles.page}>
      <Text style={styles.pageTitle}>{String(index + 2).padStart(2, "0")} INDUSTRY PATTERN</Text>
      <View style={styles.gradientBar} />
      <Text style={styles.h1}>{pattern.industry}</Text>
      <Text style={[styles.planDesc, { marginBottom: 10 }]}>{pattern.profile}</Text>

      <View style={styles.grid2}>
        <View style={styles.gridItem}>
          <Text style={styles.h2}>導入前</Text>
          {pattern.before.map((b) => (
            <Text key={b} style={styles.bullet}>
              • {b}
            </Text>
          ))}
        </View>
        <View style={styles.gridItem}>
          <Text style={[styles.h2, { color: colors.accent }]}>導入後</Text>
          {pattern.after.map((a) => (
            <Text key={a} style={styles.bullet}>
              • {a}
            </Text>
          ))}
        </View>
      </View>

      <Text style={[styles.cardDesc, { marginTop: 14 }]}>
        ＊ 上記はパイロット設計段階での想定パターンです。実数値は実施企業様ごとに異なります。
      </Text>

      <Footer />
    </Page>
  );
}

function CasesPilotProgram() {
  return (
    <Page size="A4" orientation="landscape" style={styles.page}>
      <Text style={styles.pageTitle}>PILOT PROGRAM</Text>
      <View style={styles.gradientBar} />
      <Text style={styles.h1}>パイロット参加の流れ</Text>
      <Text style={[styles.lead, { marginBottom: 10 }]}>
        事例記事は Ledra 編集部が伴走して制作します。貴社の追加負担なく、業界への発信素材としてご活用いただけます。
      </Text>

      <Text style={styles.h2}>3ステップ</Text>
      <View style={styles.card} wrap={false}>
        <Text style={styles.cardTitle}>Step 1: 事前ヒアリング（約 60 分）</Text>
        <Text style={styles.cardDesc}>
          貴社の現状業務・課題・数値の捉え方をお聞きし、事例で扱う指標と取材範囲を合意します。
        </Text>
      </View>
      <View style={styles.card} wrap={false}>
        <Text style={styles.cardTitle}>Step 2: 導入・運用定着（約 4〜12 週）</Text>
        <Text style={styles.cardDesc}>
          通常の導入支援と並行して、before の数値を記録。運用定着後、after の数値を同じ基準で採集します。
        </Text>
      </View>
      <View style={styles.card} wrap={false}>
        <Text style={styles.cardTitle}>Step 3: 取材・記事化・公開（約 2〜3 週）</Text>
        <Text style={styles.cardDesc}>
          現場インタビュー・写真撮影は Ledra 側で手配。草案・数値確認・公開タイミングも貴社にて最終承認後に反映します。
        </Text>
      </View>

      <Text style={styles.h2}>Ledra が提供するもの</Text>
      <Text style={styles.bullet}>• 記事のライティング・編集・校正</Text>
      <Text style={styles.bullet}>• 取材当日の撮影・機材手配</Text>
      <Text style={styles.bullet}>• 記事の転載許可（貴社 Web サイト・パンフレット・営業資料）</Text>
      <Text style={styles.bullet}>• プレスリリース配信のサポート（希望時）</Text>

      <Text style={styles.h2}>パイロット参加特典</Text>
      <Text style={styles.bullet}>• 初期100店舗限定キャンペーン適用（料金プラン詳細資料参照）</Text>
      <Text style={styles.bullet}>• 優先機能リクエスト受付（ロードマップ反映）</Text>
      <Text style={styles.bullet}>• Ledra 公式イベント・ウェビナーでの登壇機会</Text>

      <Footer />
    </Page>
  );
}

function CasesClosing() {
  return (
    <Page size="A4" orientation="landscape" style={styles.page}>
      <Text style={styles.pageTitle}>NEXT STEPS</Text>
      <View style={styles.gradientBar} />
      <Text style={styles.h1}>次のステップ</Text>

      <Text style={styles.lead}>
        「はじめての1社」として、業界の記録文化を一緒に作り直していただける方と、まずはお話ししたいと考えています。
      </Text>

      <Text style={styles.h2}>お声がけの経路</Text>
      <Text style={styles.body}>パイロット参加申込: https://ledra.co.jp/contact</Text>
      <Text style={styles.body}>Email: info@ledra.co.jp</Text>
      <Text style={styles.body}>事例一覧（随時更新）: https://ledra.co.jp/cases</Text>

      <Text style={[styles.h2, { marginTop: 18 }]}>事前にご用意いただくもの</Text>
      <Text style={styles.bullet}>• 直近3ヶ月程度の施工件数・記録方法のメモ（概算で構いません）</Text>
      <Text style={styles.bullet}>• 既存で利用している会計・予約・決済ツール一覧</Text>
      <Text style={styles.bullet}>• 事例化に際して外せない条件（匿名化・非公開項目など）</Text>

      <View style={[styles.card, { marginTop: 16 }]} wrap={false}>
        <Text style={styles.cardTitle}>よくいただくご質問</Text>
        <Text style={[styles.cardDesc, { marginBottom: 8 }]}>Q. 事例は必ず実名公開ですか？</Text>
        <Text style={[styles.cardDesc, { marginBottom: 8 }]}>
          A. 企業名匿名・業種のみ公開も可能です。数値の取り扱いも個別に合意します。
        </Text>
        <Text style={[styles.cardDesc, { marginBottom: 8 }]}>Q. 途中で辞退できますか？</Text>
        <Text style={styles.cardDesc}>
          A. 公開前であればいつでも辞退いただけます。取材済み素材の取り扱いも事前に合意します。
        </Text>
      </View>

      <Text style={[styles.tagline, { marginTop: 30 }]}>記録を、業界の共通言語にする。</Text>

      <Footer />
    </Page>
  );
}

function CasesPublishedPage({ cases }: { cases: ContentEntry[] }) {
  return (
    <Page size="A4" orientation="landscape" style={styles.page}>
      <Text style={styles.pageTitle}>PUBLISHED CASES</Text>
      <View style={styles.gradientBar} />
      <Text style={styles.h1}>公開済みの導入事例</Text>
      <Text style={[styles.lead, { marginBottom: 10 }]}>
        パイロット企業様の許諾のもと、/cases ページに公開しているケーススタディの一覧です。最新の全文は Web
        でお読みください。
      </Text>

      {cases.map((c) => (
        <View key={c.frontmatter.slug} style={styles.card} wrap={false}>
          <Text style={styles.cardTitle}>{c.frontmatter.title}</Text>
          <Text style={[styles.cardDesc, { marginBottom: 4 }]}>
            {[c.frontmatter.industry, c.frontmatter.company].filter(Boolean).join(" · ")}
            {c.frontmatter.publishedAt ? `  |  公開 ${c.frontmatter.publishedAt}` : ""}
          </Text>
          {c.frontmatter.excerpt && <Text style={styles.cardDesc}>{c.frontmatter.excerpt}</Text>}
          <Text style={[styles.cardDesc, { marginTop: 4, color: colors.accent }]}>
            https://ledra.co.jp/cases/{c.frontmatter.slug}
          </Text>
        </View>
      ))}

      <Text style={[styles.cardDesc, { marginTop: 14 }]}>
        最終更新は各記事のページにてご確認ください。本資料の PDF 版は、記事の追加に合わせて順次差し替えます。
      </Text>
      <Footer />
    </Page>
  );
}

export async function CaseStudiesPdf(): Promise<React.ReactElement<DocumentProps>> {
  ensureFonts();
  // Pull any published case-study MDX so the PDF reflects the live /cases
  // index instead of going stale every time a new entry lands.
  let cases: ContentEntry[] = [];
  try {
    cases = await listContent("cases");
  } catch (err) {
    console.error("[resource pdf] listContent(cases) failed:", err);
  }

  return (
    <Document
      title="Ledra 導入事例集（パイロット版）"
      author="Ledra"
      subject="Ledra 導入事例のフレームワークとパイロット参加のご案内"
      creator="Ledra"
      producer="Ledra"
    >
      {CasesCover()}

      {SectionDivider({
        no: "01",
        title: "何を測るか",
        lead: "事例を「良かった」で終わらせないために、定量・定性の両面で測る項目を先に合意します。",
      })}
      {CasesMetrics()}

      {SectionDivider({
        no: "02",
        title: "業種別の変化",
        lead: "コーティング・フィルム・ラッピング・板金・整備。業種ごとに、導入前後で何が変わるかのパターンです。",
      })}
      {INDUSTRY_PATTERNS.map((p, i) => (
        <React.Fragment key={p.industry}>{CasesIndustryPatternPage({ pattern: p, index: i })}</React.Fragment>
      ))}
      {cases.length > 0 ? CasesPublishedPage({ cases }) : null}

      {SectionDivider({
        no: "03",
        title: "参加する",
        lead: "事例記事は Ledra 編集部が伴走して制作します。貴社の追加負担なく、業界への発信素材としてお使いいただけます。",
      })}
      {CasesPilotProgram()}
      {CasesClosing()}
    </Document>
  );
}

/* ══════════════════════════════════════════════════════════════════
 * ROI Worksheet — ROI シミュレーション計算テンプレート
 * ══════════════════════════════════════════════════════════════════ */

const ROI_AFTER_MIN_PER_CERT = 3;

function yen(n: number): string {
  return `¥${n.toLocaleString("ja-JP")}`;
}

/** 月間件数・現状の1件分単価・時給をもとに、年間効果を試算 */
function roiScenario({
  monthlyCerts,
  minutesPerCert,
  hourlyRate,
  annualReissueCost,
}: {
  monthlyCerts: number;
  minutesPerCert: number;
  hourlyRate: number;
  annualReissueCost: number;
}) {
  const beforeMinYear = monthlyCerts * minutesPerCert * 12;
  const afterMinYear = monthlyCerts * ROI_AFTER_MIN_PER_CERT * 12;
  const savedMinYear = Math.max(0, beforeMinYear - afterMinYear);
  const laborSavingYen = Math.round((savedMinYear / 60) * hourlyRate);
  const reissueSavingYen = Math.round(annualReissueCost * 0.8);
  const totalSavingYen = laborSavingYen + reissueSavingYen;
  return {
    beforeHours: Math.round(beforeMinYear / 60),
    afterHours: Math.round(afterMinYear / 60),
    savedHours: Math.round(savedMinYear / 60),
    laborSavingYen,
    reissueSavingYen,
    totalSavingYen,
  };
}

function RoiCover() {
  return (
    <Page size="A4" orientation="landscape" style={styles.page}>
      <Text style={styles.pageTitle}>ROI WORKSHEET</Text>
      <View style={styles.gradientBar} />
      <Text style={styles.h1}>ROI シミュレーション 計算テンプレート</Text>
      <Text style={styles.lead}>
        月間の施工証明書発行数・1件あたりの事務時間・書類再発行コストから、Ledra
        導入時の年間削減効果を試算するための計算テンプレートです。経営会議・社内稟議の一次資料としてご活用ください。
      </Text>

      <View style={[styles.card, { marginTop: 14 }]} wrap={false}>
        <Text style={styles.cardTitle}>この資料の使い方</Text>
        <Text style={styles.bullet}>• P.2 の計算式を読み、前提を確認。</Text>
        <Text style={styles.bullet}>• P.3 の記入欄に貴社の数値を書き込む。</Text>
        <Text style={styles.bullet}>• P.4 の3つのロス別モデルで、どこが大きいか把握。</Text>
        <Text style={styles.bullet}>• P.5〜P.6 の代表スケールと比較し、推定の妥当性を確認。</Text>
        <Text style={styles.bullet}>• P.7 の依頼フォーマットで個別ヒアリング試算を依頼。</Text>
      </View>

      <View style={[styles.card, { marginTop: 10 }]} wrap={false}>
        <Text style={styles.cardTitle}>WEB 版シミュレーター</Text>
        <Text style={styles.cardDesc}>
          リアルタイムで再計算したい場合は Web 版をご利用ください: https://ledra.co.jp/roi{"\n"}本 PDF
          はオフラインでの共有・印刷用の簡略版です。
        </Text>
      </View>

      <Text style={styles.tagline}>数字で語れる一歩を、最小の時間で。</Text>
      <Footer />
    </Page>
  );
}

function RoiFormula() {
  return (
    <Page size="A4" orientation="landscape" style={styles.page}>
      <Text style={styles.pageTitle}>01 FORMULA</Text>
      <View style={styles.gradientBar} />
      <Text style={styles.h1}>計算式と前提</Text>
      <Text style={[styles.lead, { marginBottom: 10 }]}>
        試算は単純化した4入力モデルです。大雑把な推定値を出すための式と、前提の取り方をまとめています。
      </Text>

      <Text style={styles.h2}>入力変数（4つ）</Text>
      <View style={styles.tableHead}>
        <Text style={[styles.th, styles.col1]}>変数名</Text>
        <Text style={[styles.th, styles.col2]}>単位</Text>
      </View>
      <View style={styles.tableRow}>
        <Text style={[styles.td, styles.col1]}>A. 月間の施工証明書発行数</Text>
        <Text style={[styles.td, styles.col2]}>件 / 月</Text>
      </View>
      <View style={styles.tableRow}>
        <Text style={[styles.td, styles.col1]}>B. 1件あたりの事務時間（現状）</Text>
        <Text style={[styles.td, styles.col2]}>分 / 件</Text>
      </View>
      <View style={styles.tableRow}>
        <Text style={[styles.td, styles.col1]}>C. 担当者の時給相当</Text>
        <Text style={[styles.td, styles.col2]}>円 / 時</Text>
      </View>
      <View style={styles.tableRow}>
        <Text style={[styles.td, styles.col1]}>D. 書類再発行・紛失対応の年間コスト</Text>
        <Text style={[styles.td, styles.col2]}>円 / 年</Text>
      </View>

      <Text style={styles.h2}>計算式</Text>
      <View style={styles.card} wrap={false}>
        <Text style={styles.cardTitle}>年間 節約時間（時）</Text>
        <Text style={styles.cardDesc}>= A × (B − {ROI_AFTER_MIN_PER_CERT}) × 12 ÷ 60</Text>
      </View>
      <View style={styles.card} wrap={false}>
        <Text style={styles.cardTitle}>年間 人件費削減額（円）</Text>
        <Text style={styles.cardDesc}>= 年間 節約時間 × C</Text>
      </View>
      <View style={styles.card} wrap={false}>
        <Text style={styles.cardTitle}>年間 再発行/紛失対応削減額（円）</Text>
        <Text style={styles.cardDesc}>= D × 0.8</Text>
      </View>
      <View style={[styles.card, { borderColor: colors.accent }]} wrap={false}>
        <Text style={styles.cardTitle}>年間 総削減額（円）</Text>
        <Text style={styles.cardDesc}>= 年間 人件費削減額 + 年間 再発行/紛失対応削減額</Text>
      </View>

      <Text style={[styles.cardDesc, { marginTop: 8 }]}>
        ＊ Ledra 導入後の1件あたり事務時間は {ROI_AFTER_MIN_PER_CERT} 分として固定（他社平均）。 ＊ 再発行削減係数 0.8
        は、顧客ポータル・QR による自己解決率の実績値を保守的に適用。
      </Text>

      <Footer />
    </Page>
  );
}

function RoiWorksheet() {
  const blankLine = "_______________________________";
  return (
    <Page size="A4" orientation="landscape" style={styles.page}>
      <Text style={styles.pageTitle}>02 WORKSHEET</Text>
      <View style={styles.gradientBar} />
      <Text style={styles.h1}>記入シート</Text>
      <Text style={[styles.lead, { marginBottom: 10 }]}>
        以下の空欄に、貴社の概算値を書き込んでください。概算で構いません。
      </Text>

      <Text style={styles.h2}>入力</Text>
      <View style={styles.card} wrap={false}>
        <Text style={styles.cardTitle}>A. 月間の施工証明書発行数</Text>
        <Text style={styles.body}>{blankLine} 件 / 月</Text>
      </View>
      <View style={styles.card} wrap={false}>
        <Text style={styles.cardTitle}>B. 1件あたりの事務時間（現状）</Text>
        <Text style={styles.body}>{blankLine} 分 / 件</Text>
        <Text style={styles.cardDesc}>例: 写真整理 + Excel 入力 + 印刷 + 封入 + 保管のすべて合算</Text>
      </View>
      <View style={styles.card} wrap={false}>
        <Text style={styles.cardTitle}>C. 担当者の時給相当</Text>
        <Text style={styles.body}>{blankLine} 円 / 時</Text>
        <Text style={styles.cardDesc}>月給 ÷ 160 を目安に。社会保険等を含める場合は月給×1.25 ÷ 160。</Text>
      </View>
      <View style={styles.card} wrap={false}>
        <Text style={styles.cardTitle}>D. 書類再発行・紛失対応の年間コスト</Text>
        <Text style={styles.body}>{blankLine} 円 / 年</Text>
      </View>

      <Text style={styles.h2}>計算結果（記入欄）</Text>
      <View style={styles.card} wrap={false}>
        <Text style={styles.cardTitle}>年間 節約時間</Text>
        <Text style={styles.body}>{blankLine} 時間</Text>
      </View>
      <View style={styles.card} wrap={false}>
        <Text style={styles.cardTitle}>年間 人件費削減額</Text>
        <Text style={styles.body}>{blankLine} 円</Text>
      </View>
      <View style={[styles.card, { borderColor: colors.accent }]} wrap={false}>
        <Text style={styles.cardTitle}>年間 総削減額</Text>
        <Text style={styles.body}>{blankLine} 円</Text>
      </View>

      <Footer />
    </Page>
  );
}

function RoiLossModel() {
  return (
    <Page size="A4" orientation="landscape" style={styles.page}>
      <Text style={styles.pageTitle}>03 LOSS MODEL</Text>
      <View style={styles.gradientBar} />
      <Text style={styles.h1}>3つのロスの換算モデル</Text>
      <Text style={[styles.lead, { marginBottom: 10 }]}>
        Ledra が解消する業務ロスは大きく3種類。自社でどのロスが大きいかを見極める参考に。
      </Text>

      <View style={styles.card} wrap={false}>
        <Text style={styles.cardTitle}>ロス1: 事務時間のロス</Text>
        <Text style={styles.cardDesc}>
          紙・Excel での作成・郵送・保管・検索にかかる時間。変数 A × B を中心に算出。Ledra では1件
          {ROI_AFTER_MIN_PER_CERT} 分相当に短縮（入力・QR 送付のみ）。
        </Text>
        <Text style={[styles.cardDesc, { marginTop: 4 }]}>
          金額化: 節約時間 × 変数 C（時給）。繁忙期の残業代単価を使うとより実態に近い数値に。
        </Text>
      </View>

      <View style={styles.card} wrap={false}>
        <Text style={styles.cardTitle}>ロス2: 再発行のロス</Text>
        <Text style={styles.cardDesc}>
          紛失・問い合わせ・再発行・郵送のコスト。変数 D。Ledra 導入後は顧客ポータル・QR
          による自己解決が大半となり、保守的に 80% 削減として試算。
        </Text>
        <Text style={[styles.cardDesc, { marginTop: 4 }]}>
          金額化: D × 0.8。郵送費・封筒代・人件費の合算で見積もると実効値が取りやすい。
        </Text>
      </View>

      <View style={styles.card} wrap={false}>
        <Text style={styles.cardTitle}>ロス3: 信頼のロス（金額換算しづらい領域）</Text>
        <Text style={styles.cardDesc}>
          改ざん疑念による査定・精算の遅延、SNS での誤情報対応、競合比較時の「説明コスト」。Polygon anchoring + C2PA
          署名で第三者検証可能な証明に置き換わり、根本から抑制。
        </Text>
        <Text style={[styles.cardDesc, { marginTop: 4 }]}>
          金額化:
          直接計算が難しいため、本テンプレートでは計算対象外。ただし、保険・代理店との折衝頻度が多い企業ほど実効削減は大きい。
        </Text>
      </View>

      <Footer />
    </Page>
  );
}

function RoiReferenceTable() {
  const scenarios = [
    {
      label: "月 50 件（小規模）",
      inputs: { monthlyCerts: 50, minutesPerCert: 15, hourlyRate: 2500, annualReissueCost: 60000 },
    },
    {
      label: "月 100 件（標準）",
      inputs: { monthlyCerts: 100, minutesPerCert: 15, hourlyRate: 2500, annualReissueCost: 100000 },
    },
    {
      label: "月 300 件（複数店舗）",
      inputs: { monthlyCerts: 300, minutesPerCert: 15, hourlyRate: 2500, annualReissueCost: 250000 },
    },
  ];

  return (
    <Page size="A4" orientation="landscape" style={styles.page}>
      <Text style={styles.pageTitle}>04 REFERENCE SCALES</Text>
      <View style={styles.gradientBar} />
      <Text style={styles.h1}>代表スケール別の試算値（参考）</Text>
      <Text style={[styles.lead, { marginBottom: 10 }]}>
        1件あたりの事務時間 15分・時給 2,500円 を共通前提とした、3スケールの試算値です。
      </Text>

      <View style={styles.tableHead}>
        <Text style={[styles.th, { flex: 2 }]}>スケール</Text>
        <Text style={[styles.th, { flex: 1.2, textAlign: "right" }]}>節約時間</Text>
        <Text style={[styles.th, { flex: 1.3, textAlign: "right" }]}>人件費削減</Text>
        <Text style={[styles.th, { flex: 1.3, textAlign: "right" }]}>再発行削減</Text>
        <Text style={[styles.th, { flex: 1.4, textAlign: "right" }]}>総削減額</Text>
      </View>
      {scenarios.map((s) => {
        const r = roiScenario(s.inputs);
        return (
          <View key={s.label} style={styles.tableRow}>
            <Text style={[styles.td, { flex: 2 }]}>{s.label}</Text>
            <Text style={[styles.td, { flex: 1.2, textAlign: "right" }]}>{r.savedHours}時間</Text>
            <Text style={[styles.td, { flex: 1.3, textAlign: "right" }]}>{yen(r.laborSavingYen)}</Text>
            <Text style={[styles.td, { flex: 1.3, textAlign: "right" }]}>{yen(r.reissueSavingYen)}</Text>
            <Text style={[styles.td, { flex: 1.4, textAlign: "right", color: colors.accent }]}>
              {yen(r.totalSavingYen)}
            </Text>
          </View>
        );
      })}

      <Text style={[styles.h2, { marginTop: 18 }]}>スケール別の読み方</Text>
      <Text style={styles.bullet}>
        • 月50件: 1名担当でも事務時間の負担が明確に、スターター/スタンダード導入で数ヶ月以内に投資回収が見込める水準。
      </Text>
      <Text style={styles.bullet}>• 月100件: 本資料の標準ケース。事務専任者の業務の中核を Ledra に置き換え可能。</Text>
      <Text style={styles.bullet}>
        • 月300件: 複数店舗の運用ケース。スケールメリットが発現し、人件費削減の寄与が特に大きい。
      </Text>

      <Text style={[styles.cardDesc, { marginTop: 14 }]}>
        ＊
        数値はすべて、本資料の計算式および前提条件に基づく推定です。実効果は業態・既存業務・人員構成により変動します。
      </Text>

      <Footer />
    </Page>
  );
}

function RoiSensitivity() {
  const base = { monthlyCerts: 100, hourlyRate: 2500, annualReissueCost: 100000 };
  const rows = [5, 10, 15, 20, 30].map((m) => {
    const r = roiScenario({ ...base, minutesPerCert: m });
    return { minutes: m, labor: r.laborSavingYen, total: r.totalSavingYen };
  });
  return (
    <Page size="A4" orientation="landscape" style={styles.page}>
      <Text style={styles.pageTitle}>05 SENSITIVITY</Text>
      <View style={styles.gradientBar} />
      <Text style={styles.h1}>感度分析（1件あたり事務時間 × 金額）</Text>
      <Text style={[styles.lead, { marginBottom: 10 }]}>
        月 100 件・時給 2,500 円・再発行コスト 10
        万円を固定した上で、1件あたりの事務時間の変化が総削減額に与える影響を示します。
      </Text>

      <View style={styles.tableHead}>
        <Text style={[styles.th, { flex: 1.6 }]}>1件あたりの事務時間</Text>
        <Text style={[styles.th, { flex: 1.5, textAlign: "right" }]}>人件費削減</Text>
        <Text style={[styles.th, { flex: 1.5, textAlign: "right" }]}>総削減額</Text>
      </View>
      {rows.map((r) => (
        <View key={r.minutes} style={styles.tableRow}>
          <Text style={[styles.td, { flex: 1.6 }]}>{r.minutes} 分 / 件</Text>
          <Text style={[styles.td, { flex: 1.5, textAlign: "right" }]}>{yen(r.labor)}</Text>
          <Text style={[styles.td, { flex: 1.5, textAlign: "right", color: colors.accent }]}>{yen(r.total)}</Text>
        </View>
      ))}

      <Text style={[styles.h2, { marginTop: 18 }]}>読み取り方</Text>
      <Text style={styles.bullet}>
        • 1件 5 分の「効率化済み」運用でも、写真整理・保管の切替だけで年間の削減が生まれます。
      </Text>
      <Text style={styles.bullet}>• 1件 15〜20 分が最も多い初期ヒアリング結果。Ledra の効果がはっきり出るゾーン。</Text>
      <Text style={styles.bullet}>
        • 1件 30 分以上: 書類業務が施工能力のボトルネックになっている可能性。人員体制見直しと併せた効果を検討。
      </Text>

      <Footer />
    </Page>
  );
}

function RoiClosing() {
  return (
    <Page size="A4" orientation="landscape" style={styles.page}>
      <Text style={styles.pageTitle}>06 NEXT STEPS</Text>
      <View style={styles.gradientBar} />
      <Text style={styles.h1}>個別ヒアリング試算のご依頼</Text>
      <Text style={[styles.lead, { marginBottom: 10 }]}>
        貴社の業務フロー・既存システム・人員構成を踏まえた、より精度の高い試算レポートを無料でお作りします。
      </Text>

      <Text style={styles.h2}>お伝えいただきたい情報</Text>
      <Text style={styles.bullet}>• 月間の施工証明書発行数・種別（コーティング / フィルム / 他）</Text>
      <Text style={styles.bullet}>• 現状の記録方法（紙 / Excel / 他システム）</Text>
      <Text style={styles.bullet}>• 事務担当の人員構成と業務時間</Text>
      <Text style={styles.bullet}>• 代理店・保険会社との連携頻度</Text>
      <Text style={styles.bullet}>• 既存で利用している会計・予約・決済ツール</Text>

      <Text style={styles.h2}>試算レポートに含まれるもの</Text>
      <Text style={styles.bullet}>• 貴社前提を反映した年間削減額（時間・金額）</Text>
      <Text style={styles.bullet}>• 3プラン（スターター / スタンダード / プロ）ごとの投資回収シミュレーション</Text>
      <Text style={styles.bullet}>• 現場導入プランと、ロードマップ上のマイルストーン</Text>

      <Text style={[styles.h2, { marginTop: 14 }]}>お問い合わせ</Text>
      <Text style={styles.body}>Web: https://ledra.co.jp/contact</Text>
      <Text style={styles.body}>Email: info@ledra.co.jp</Text>
      <Text style={styles.body}>WEB 版シミュレーター: https://ledra.co.jp/roi</Text>

      <Text style={[styles.tagline, { marginTop: 24 }]}>数字は、意思決定の速度を変える。</Text>

      <Footer />
    </Page>
  );
}

export function RoiTemplatePdf() {
  ensureFonts();
  return (
    <Document
      title="Ledra ROI シミュレーション計算テンプレート"
      author="Ledra"
      subject="Ledra 導入時の年間削減効果を試算する計算テンプレート"
      creator="Ledra"
      producer="Ledra"
    >
      {RoiCover()}

      {SectionDivider({
        no: "01",
        title: "計算式",
        lead: "何をどう足し引きして削減額を出すのか。前提を先に開いておきます。",
      })}
      {RoiFormula()}

      {SectionDivider({
        no: "02",
        title: "記入する",
        lead: "自社の数字を書き込むワークシートです。印刷してそのままお使いいただけます。",
      })}
      {RoiWorksheet()}

      {SectionDivider({
        no: "03",
        title: "確かめる",
        lead: "見落としがちな損失、規模別の参考値、前提が外れたときの振れ幅。出した数字を自分で疑うための材料です。",
      })}
      {RoiLossModel()}
      {RoiReferenceTable()}
      {RoiSensitivity()}
      {RoiClosing()}
    </Document>
  );
}

/* ══════════════════════════════════════════════════════════════════
 * Operation Guide — 運用スタートガイド
 *
 * `OPERATION_GUIDE_GROUPS`（HelpDrawer / /guide / 代理店ヘルプセンターと
 * 同じデータ）から丸ごと生成する。手順を1つ足せば PDF にも自動で載るので、
 * 本部が資料を差し替える運用が要らない。
 * ══════════════════════════════════════════════════════════════════ */

/**
 * カードを **2枚1組の行** に並べる。
 *
 * 以前は左列・右列に全カードを積んでいたが、列ごとに独立して改ページされるため、
 * 右列の最後の1枚だけが次ページに落ちて**左半分が丸ごと空く**ことがあった
 * （A4 横にして天地が狭くなり、実際に発生した）。行単位にして `wrap={false}` を
 * 付ければ、改ページは必ず行の境で起き、左右の高さも揃う。
 */
function CardGrid({ items }: { items: { title: string; desc: string }[] }) {
  const rows: (typeof items)[] = [];
  for (let i = 0; i < items.length; i += 2) rows.push(items.slice(i, i + 2));
  return (
    <>
      {rows.map((row) => (
        <View key={row[0].title} style={styles.grid2} wrap={false}>
          {row.map((it) => (
            <View key={it.title} style={[styles.gridItem, styles.card]}>
              <Text style={styles.cardTitle}>{pdfSafe(it.title)}</Text>
              <Text style={styles.cardDesc}>{pdfSafe(it.desc)}</Text>
            </View>
          ))}
          {/* 奇数枚のときに最後の1枚が全幅に伸びないよう、空きを1つ噛ませる */}
          {row.length === 1 && <View style={styles.gridItem} />}
        </View>
      ))}
    </>
  );
}

/* ──────────────────────────────────────────────────────────────
 * プレゼンの骨格
 *
 * 資料は投影・対面提示で使う前提なので、「カードを敷き詰めた紙面」ではなく
 * **章扉で区切られた流れ**にする。読み手が今どの話をしているか見失わないよう、
 * 章扉 → 主張 → 根拠（画面や機能）の順で並べる。
 * ────────────────────────────────────────────────────────────── */

const deckStyles = StyleSheet.create({
  /** 章扉。地をアクセントの淡色で塗り、番号を大きく置く */
  dividerPage: {
    fontFamily: "NotoSansJP",
    backgroundColor: colors.surface,
    color: colors.text,
    paddingHorizontal: 56,
    paddingTop: 42,
    paddingBottom: 54,
    justifyContent: "center",
  },
  dividerNo: {
    fontSize: 64,
    fontWeight: 700,
    color: colors.accent,
    letterSpacing: -2,
    marginBottom: 4,
  },
  dividerTitle: {
    fontSize: 34,
    fontWeight: 700,
    color: colors.text,
    letterSpacing: -0.5,
    marginBottom: 12,
  },
  dividerLead: {
    fontSize: 14,
    color: colors.mute,
    lineHeight: 1.7,
    maxWidth: 560,
    paddingLeft: 14,
    borderLeftWidth: 3,
    borderLeftColor: colors.gold,
  },
  /** 画面キャプチャのスライド: 左に説明、右に画面 */
  shotRow: {
    flexDirection: "row",
    gap: 20,
    marginTop: 4,
  },
  shotText: {
    flex: 1,
    paddingTop: 4,
  },
  shotFrame: {
    flex: 1.55,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    padding: 4,
    backgroundColor: colors.surface,
  },
  shotImage: {
    objectFit: "contain",
  },
  shotCaption: {
    fontSize: 8.5,
    color: colors.mute2,
    marginTop: 5,
  },
});

/**
 * `public/screenshots/` 配下の画面キャプチャ。
 *
 * キャプチャは `scripts/capture-screenshots.ts` が Supabase のデモテナント
 * （`ledra-motors-demo`）にログインして撮る。**リポジトリには入っていない**ので、
 * 無ければその枠ごと出さない ―― 未取得のまま空枠や壊れた画像を刷らないため。
 */
function screenshotFile(rel: string): string | null {
  const abs = path.join(process.cwd(), "public", "screenshots", rel);
  return existsSync(abs) ? abs : null;
}

export function hasScreenshot(rel: string): boolean {
  return screenshotFile(rel) !== null;
}

/** 章扉スライド。 */
function SectionDivider({ no, title, lead }: { no: string; title: string; lead: string }) {
  return (
    <Page size="A4" orientation="landscape" style={deckStyles.dividerPage}>
      <Text style={deckStyles.dividerNo}>{no}</Text>
      <Text style={deckStyles.dividerTitle}>{pdfSafe(title)}</Text>
      <Text style={deckStyles.dividerLead}>{pdfSafe(lead)}</Text>
      <Footer />
    </Page>
  );
}

/**
 * 画面キャプチャのスライド。キャプチャが未取得なら**ページごと出さない**
 * （`null` を返す。react-pdf は Document の子の null を無視する）。
 */
function ScreenshotSlide({
  eyebrow,
  title,
  lead,
  points,
  file,
  caption,
}: {
  eyebrow: string;
  title: string;
  lead: string;
  points: string[];
  file: string;
  caption: string;
}) {
  const src = screenshotFile(file);
  if (!src) return null;
  return (
    <Page size="A4" orientation="landscape" style={styles.page}>
      <Text style={styles.pageTitle}>{eyebrow}</Text>
      <View style={styles.gradientBar} />
      <Text style={styles.h1}>{pdfSafe(title)}</Text>

      <View style={deckStyles.shotRow}>
        <View style={deckStyles.shotText}>
          <Text style={[styles.lead, { maxWidth: undefined }]}>{pdfSafe(lead)}</Text>
          {points.map((p) => (
            <Text key={p} style={styles.bullet}>
              • {pdfSafe(p)}
            </Text>
          ))}
        </View>
        <View style={deckStyles.shotFrame}>
          {/* react-pdf の Image は DOM の img ではなく alt を受け取らない。
              jsx-a11y の規則は PDF プリミティブには当たらないので個別に外す。
              代替テキストの役割は下の caption が担う。 */}
          {/* eslint-disable-next-line jsx-a11y/alt-text */}
          <Image src={src} style={deckStyles.shotImage} />
          <Text style={deckStyles.shotCaption}>{pdfSafe(caption)}</Text>
        </View>
      </View>

      <Footer />
    </Page>
  );
}

const guideStyles = StyleSheet.create({
  guide: {
    backgroundColor: colors.surface,
    border: `1pt solid ${colors.border}`,
    borderRadius: 7,
    padding: 12,
    marginBottom: 8,
  },
  guideTitle: {
    fontSize: 11.5,
    fontWeight: 700,
    color: colors.text,
    marginBottom: 6,
  },
  step: {
    flexDirection: "row",
    marginBottom: 4,
  },
  stepNo: {
    width: 16,
    fontSize: 9,
    fontWeight: 700,
    color: colors.accent,
  },
  stepBody: {
    flex: 1,
  },
  stepTitle: {
    fontSize: 9.5,
    fontWeight: 700,
    color: colors.text,
  },
  stepDesc: {
    fontSize: 9,
    color: colors.mute,
    lineHeight: 1.55,
  },
});

function OperationGuideCover() {
  const guideCount = OPERATION_GUIDE_GROUPS.reduce((n, g) => n + g.guides.length, 0);
  return (
    <Page size="A4" orientation="landscape" style={styles.page}>
      <Text style={styles.pageTitle}>OPERATION GUIDE</Text>
      <View style={styles.gradientBar} />
      <Text style={styles.h1}>運用スタートガイド</Text>
      <Text style={styles.lead}>
        Ledra
        を導入した店舗が、初日から迷わず回せるようにするための操作手順書です。証明書の発行・予約・会計といった日常業務から、店舗設定・スタッフ招待まで、
        {guideCount}の操作を画面の流れどおりに並べています。
      </Text>

      <View style={[styles.card, { marginTop: 18 }]} wrap={false}>
        <Text style={styles.cardTitle}>この資料の構成</Text>
        {OPERATION_GUIDE_GROUPS.map((g, i) => (
          <Text key={g.id} style={styles.bullet}>
            {String(i + 1).padStart(2, "0")}. {pdfSafe(g.label)}（{g.guides.length}項目）
            {g.intro ? ` — ${pdfSafe(g.intro)}` : ""}
          </Text>
        ))}
      </View>

      <View style={[styles.card, { marginTop: 10 }]} wrap={false}>
        <Text style={styles.cardTitle}>使い方</Text>
        <Text style={styles.bullet}>• 導入研修の配布資料として、そのまま印刷してお使いいただけます。</Text>
        <Text style={styles.bullet}>
          • 同じ内容は管理画面の右下ヘルプボタン、および ledra.co.jp/guide からも参照できます。
        </Text>
        <Text style={styles.bullet}>• 機能追加に合わせて本 PDF も自動で更新されます（差し替え不要）。</Text>
      </View>

      <Text style={styles.tagline}>迷ったら、この1冊に戻れる。</Text>
      <Footer />
    </Page>
  );
}

function OperationGuideGroupPage({ group, index }: { group: GuideGroup; index: number }) {
  return (
    <Page size="A4" orientation="landscape" style={styles.page} wrap>
      <Text style={styles.pageTitle} fixed>
        {String(index + 1).padStart(2, "0")} {pdfSafe(group.label)}
      </Text>
      <View style={styles.gradientBar} fixed />
      <Text style={styles.h1}>{pdfSafe(group.label)}</Text>
      {group.intro && <Text style={[styles.lead, { marginBottom: 10 }]}>{pdfSafe(group.intro)}</Text>}

      {group.guides.map((guide) => (
        <View key={guide.id} style={guideStyles.guide} wrap={false}>
          <Text style={guideStyles.guideTitle}>{pdfSafe(guide.title)}</Text>
          {guide.steps.map((step, i) => (
            <View key={step.title} style={guideStyles.step}>
              <Text style={guideStyles.stepNo}>{i + 1}.</Text>
              <View style={guideStyles.stepBody}>
                <Text style={guideStyles.stepTitle}>{pdfSafe(step.title)}</Text>
                <Text style={guideStyles.stepDesc}>{pdfSafe(step.description)}</Text>
              </View>
            </View>
          ))}
        </View>
      ))}

      <Footer />
    </Page>
  );
}

function OperationGuideClosing() {
  return (
    <Page size="A4" orientation="landscape" style={styles.page}>
      <Text style={styles.pageTitle}>SUPPORT</Text>
      <View style={styles.gradientBar} />
      <Text style={styles.h1}>困ったときの窓口</Text>
      <Text style={styles.lead}>
        手順どおりに進めても解決しない場合は、画面の状態がわかるスクリーンショットを添えてご連絡ください。
      </Text>

      <Text style={styles.h2}>問い合わせ先</Text>
      <Text style={styles.body}>サポート: https://ledra.co.jp/support</Text>
      <Text style={styles.body}>Email: info@ledra.co.jp</Text>
      <Text style={styles.body}>操作ガイド（Web 版・随時更新）: https://ledra.co.jp/guide</Text>
      <Text style={styles.body}>よくあるご質問: https://ledra.co.jp/faq</Text>

      <Text style={[styles.h2, { marginTop: 18 }]}>お伝えいただけると早いこと</Text>
      <Text style={styles.bullet}>• どの画面で、どの操作をしたときに起きたか</Text>
      <Text style={styles.bullet}>• 表示されたメッセージの文言（あれば）</Text>
      <Text style={styles.bullet}>• 使用端末（PC / スマホ / タブレット）とブラウザ</Text>

      <Text style={styles.tagline}>記録を、業界の共通言語にする。</Text>
      <Footer />
    </Page>
  );
}

export function OperationGuidePdf() {
  ensureFonts();
  return (
    <Document
      title="Ledra 運用スタートガイド"
      author="Ledra"
      subject="Ledra の日常業務・店舗設定・便利機能の操作手順書"
      creator="Ledra"
      producer="Ledra"
    >
      {OperationGuideCover()}

      {/* グループがそのまま章になる。章扉はデータから作るので、
          グループが増えても章立ての外に落ちない。 */}
      {OPERATION_GUIDE_GROUPS.map((g, i) => (
        <React.Fragment key={g.id}>
          {SectionDivider({
            no: String(i + 1).padStart(2, "0"),
            title: g.label,
            lead: g.intro ?? "",
          })}
          {OperationGuideGroupPage({ group: g, index: i })}
        </React.Fragment>
      ))}
      {OperationGuideClosing()}
    </Document>
  );
}

/* ══════════════════════════════════════════════════════════════════
 * Glossary — 業界用語集
 *
 * `/glossary` と同じ `GLOSSARY` を使う。用語を足せば PDF にも載る。
 * ══════════════════════════════════════════════════════════════════ */

const glossaryStyles = StyleSheet.create({
  term: {
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border,
    paddingVertical: 8,
  },
  termHead: {
    flexDirection: "row",
    alignItems: "baseline",
    marginBottom: 3,
  },
  termName: {
    fontSize: 12,
    fontWeight: 700,
    color: colors.text,
  },
  termReading: {
    fontSize: 8.5,
    color: colors.mute2,
    marginLeft: 8,
    flex: 1,
  },
  termDef: {
    fontSize: 9.5,
    color: colors.body,
    lineHeight: 1.65,
  },
  termLink: {
    fontSize: 8.5,
    color: colors.accent,
    marginTop: 3,
  },
});

function GlossaryCover() {
  const sections = listGlossaryByCategory();
  const termCount = sections.reduce((n, s) => n + s.terms.length, 0);
  return (
    <Page size="A4" orientation="landscape" style={styles.page}>
      <Text style={styles.pageTitle}>GLOSSARY</Text>
      <View style={styles.gradientBar} />
      <Text style={styles.h1}>自動車施工・記録の用語集</Text>
      <Text style={styles.lead}>
        コーティング・板金・保険査定・デジタル証明の現場で使われる{termCount}
        語を、事実ベースでまとめました。新人研修の副読本、保険会社・代理店との認識合わせ、商談時の共通言語づくりにお使いください。
      </Text>

      <View style={[styles.card, { marginTop: 18 }]} wrap={false}>
        <Text style={styles.cardTitle}>収録カテゴリ</Text>
        {sections.map((s, i) => (
          <Text key={s.category} style={styles.bullet}>
            {String(i + 1).padStart(2, "0")}. {pdfSafe(GLOSSARY_CATEGORIES[s.category].label)}（{s.terms.length}語） —{" "}
            {pdfSafe(GLOSSARY_CATEGORIES[s.category].description)}
          </Text>
        ))}
      </View>

      <View style={[styles.card, { marginTop: 10 }]} wrap={false}>
        <Text style={styles.cardTitle}>編集方針</Text>
        <Text style={styles.bullet}>
          • 定義は一般に受け入れられた事実のみ。製品固有の誇張・未確認の数値は載せません。
        </Text>
        <Text style={styles.bullet}>• 各語の詳細と関連語は ledra.co.jp/glossary で参照できます。</Text>
      </View>

      <Text style={styles.tagline}>同じ言葉で話せると、記録は早く正確になる。</Text>
      <Footer />
    </Page>
  );
}

function GlossaryCategoryPage({
  category,
  terms,
  index,
}: {
  category: GlossaryCategory;
  terms: ReturnType<typeof listGlossaryByCategory>[number]["terms"];
  index: number;
}) {
  const meta = GLOSSARY_CATEGORIES[category];
  return (
    <Page size="A4" orientation="landscape" style={styles.page} wrap>
      <Text style={styles.pageTitle} fixed>
        {String(index + 1).padStart(2, "0")} {pdfSafe(meta.label)}
      </Text>
      <View style={styles.gradientBar} fixed />
      <Text style={styles.h1}>{pdfSafe(meta.label)}</Text>
      <Text style={[styles.lead, { marginBottom: 6 }]}>{pdfSafe(meta.description)}</Text>

      {terms.map((t) => (
        <View key={t.slug} style={glossaryStyles.term} wrap={false}>
          <View style={glossaryStyles.termHead}>
            <Text style={glossaryStyles.termName}>{pdfSafe(t.term)}</Text>
            <Text style={glossaryStyles.termReading}>{pdfSafe(t.reading)}</Text>
          </View>
          <Text style={glossaryStyles.termDef}>{pdfSafe(t.definition)}</Text>
          {t.seeAlso && (
            <Text style={glossaryStyles.termLink}>
              参考: {pdfSafe(t.seeAlso.label)} https://ledra.co.jp{t.seeAlso.href}
            </Text>
          )}
        </View>
      ))}

      <Footer />
    </Page>
  );
}

export function GlossaryPdf() {
  ensureFonts();
  const sections = listGlossaryByCategory();
  return (
    <Document
      title="Ledra 自動車施工・記録の用語集"
      author="Ledra"
      subject="コーティング・板金・保険査定・デジタル証明の用語集"
      creator="Ledra"
      producer="Ledra"
    >
      {GlossaryCover()}
      {sections.map((s, i) => (
        <React.Fragment key={s.category}>
          {GlossaryCategoryPage({ category: s.category, terms: s.terms, index: i })}
        </React.Fragment>
      ))}
    </Document>
  );
}

/**
 * Registry of available marketing PDFs. Add entries here to expose new
 * downloadable resources; the API route `/api/marketing/resources/[key]/pdf`
 * reads from this map.
 */
/**
 * Locales the resource PDFs can render in. `ja` is the authored baseline.
 * `en` is reserved: the registry currently throws for `en` because there
 * is no English copy yet, but the API route and factory signatures are
 * locale-aware so adding translations later is additive (not invasive).
 */
export const SUPPORTED_PDF_LOCALES = ["ja"] as const;
export type PdfLocale = (typeof SUPPORTED_PDF_LOCALES)[number];

export function isSupportedPdfLocale(raw: string | null | undefined): raw is PdfLocale {
  return !!raw && (SUPPORTED_PDF_LOCALES as readonly string[]).includes(raw);
}

export type ResourcePdfOpts = { locale: PdfLocale };

export type ResourcePdfEntry = {
  /** Filename may vary by locale (e.g. `_en.pdf`). */
  filename: (opts: ResourcePdfOpts) => string;
  /**
   * Factory for the Document react element. May be async — case-studies
   * loads MDX content at render time. The API route awaits before handing
   * to renderToBuffer.
   */
  doc: (opts: ResourcePdfOpts) => React.ReactElement<DocumentProps> | Promise<React.ReactElement<DocumentProps>>;
};

/**
 * Map a baseline filename stem + locale to a concrete filename. `ja` uses
 * the original stem; other locales append `_<locale>` before `.pdf`.
 */
function localizedFilename(stem: string, locale: PdfLocale): string {
  return locale === "ja" ? `${stem}.pdf` : `${stem}_${locale}.pdf`;
}

export const RESOURCE_PDFS: Record<string, ResourcePdfEntry> = {
  "service-overview": {
    filename: ({ locale }) => localizedFilename("Ledra_Service_Overview", locale),
    doc: () => <ServiceOverviewPdf />,
  },
  "pricing-overview": {
    filename: ({ locale }) => localizedFilename("Ledra_Pricing_Overview", locale),
    doc: () => <PricingOverviewPdf />,
  },
  "features-deep-dive": {
    filename: ({ locale }) => localizedFilename("Ledra_Features_Deep_Dive", locale),
    doc: () => <FeaturesDeepDivePdf />,
  },
  "security-whitepaper": {
    filename: ({ locale }) => localizedFilename("Ledra_Security_Whitepaper", locale),
    doc: () => <SecurityWhitepaperPdf />,
  },
  "case-studies": {
    filename: ({ locale }) => localizedFilename("Ledra_Case_Studies", locale),
    doc: () => CaseStudiesPdf(),
  },
  "roi-template": {
    filename: ({ locale }) => localizedFilename("Ledra_ROI_Template", locale),
    doc: () => <RoiTemplatePdf />,
  },
  "operation-guide": {
    filename: ({ locale }) => localizedFilename("Ledra_Operation_Guide", locale),
    doc: () => <OperationGuidePdf />,
  },
  glossary: {
    filename: ({ locale }) => localizedFilename("Ledra_Glossary", locale),
    doc: () => <GlossaryPdf />,
  },
};
