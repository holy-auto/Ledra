/**
 * Marketing resource PDFs — generated server-side via @react-pdf/renderer.
 *
 * Initial scope: one "service overview" resource. Additional PDFs can be
 * added by exporting new Document components from this module and wiring
 * them in `src/app/api/marketing/resources/[key]/pdf/route.ts`.
 */

import React from "react";
import { Document, Page, Text, View, StyleSheet, Font } from "@react-pdf/renderer";

const NOTO = "https://cdn.jsdelivr.net/fontsource/fonts/noto-sans-jp@latest/japanese-400-normal.ttf";
const NOTO_BOLD = "https://cdn.jsdelivr.net/fontsource/fonts/noto-sans-jp@latest/japanese-700-normal.ttf";

let fontsRegistered = false;
function ensureFonts() {
  if (fontsRegistered) return;
  Font.register({
    family: "NotoSansJP",
    fonts: [
      { src: NOTO, fontWeight: 400 },
      { src: NOTO_BOLD, fontWeight: 700 },
    ],
  });
  fontsRegistered = true;
}

const colors = {
  bg: "#060a12",
  bgAlt: "#0b111c",
  text: "#ffffff",
  mute: "#8e99b0",
  mute2: "#5f6a81",
  accent: "#60a5fa",
  accent2: "#a78bfa",
  border: "#1a2233",
};

const styles = StyleSheet.create({
  page: {
    fontFamily: "NotoSansJP",
    backgroundColor: colors.bg,
    color: colors.text,
    padding: 48,
  },
  pageTitle: {
    fontSize: 9,
    color: colors.mute2,
    marginBottom: 6,
    letterSpacing: 2,
  },
  h1: {
    fontSize: 24,
    fontWeight: 700,
    lineHeight: 1.25,
    marginBottom: 16,
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
    fontSize: 12,
    color: colors.mute,
    lineHeight: 1.7,
    marginBottom: 14,
  },
  body: {
    fontSize: 10.5,
    color: "#c8cfdd",
    lineHeight: 1.75,
    marginBottom: 8,
  },
  card: {
    border: `1pt solid ${colors.border}`,
    borderRadius: 6,
    padding: 14,
    marginVertical: 6,
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
    gap: 10,
  },
  gridItem: {
    flex: 1,
  },
  gradientBar: {
    height: 3,
    backgroundColor: colors.accent,
    marginBottom: 22,
  },
  footer: {
    position: "absolute",
    bottom: 28,
    left: 48,
    right: 48,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 8,
    color: colors.mute2,
  },
  tagline: {
    marginTop: 30,
    fontSize: 14,
    fontWeight: 700,
    color: colors.accent2,
  },
  bullet: {
    fontSize: 10.5,
    color: "#c8cfdd",
    lineHeight: 1.7,
    marginBottom: 4,
    paddingLeft: 14,
  },
});

const updated = new Date().toLocaleDateString("ja-JP", {
  year: "numeric",
  month: "long",
  day: "numeric",
});

/* ────────────────────────────────────────────────────────── */

function Footer({ pageLabel }: { pageLabel: string }) {
  return (
    <View style={styles.footer} fixed>
      <Text>Ledra | WEB施工証明書SaaS</Text>
      <Text>
        {pageLabel}  ·  更新: {updated}
      </Text>
    </View>
  );
}

function Page1Cover() {
  return (
    <Page size="A4" style={styles.page}>
      <Text style={styles.pageTitle}>SERVICE OVERVIEW</Text>
      <View style={styles.gradientBar} />
      <Text style={styles.h1}>
        記録を、業界の共通言語にする。
      </Text>
      <Text style={styles.lead}>
        Ledra は、自動車施工（コーティング・フィルム・ラッピング・板金・整備）の記録を、改ざん不可能なデジタル証明書として発行・共有する WEB 施工証明書 SaaS です。
      </Text>
      <Text style={styles.lead}>
        施工店・代理店・保険会社・顧客の4ポータルが、同じ「施工の事実」を役割に応じて閲覧・検証できる設計により、業界全体の記録文化を一段引き上げます。
      </Text>

      <View style={[styles.card, { marginTop: 26 }]}>
        <Text style={styles.cardTitle}>この資料でお伝えすること</Text>
        <Text style={styles.bullet}>• Ledra が解決する3つの業界課題</Text>
        <Text style={styles.bullet}>• 主要機能と、施工店が得られる業務変化</Text>
        <Text style={styles.bullet}>• 信頼の土台を作る技術（Polygon anchoring / C2PA）</Text>
        <Text style={styles.bullet}>• 導入プロセスとサポート体制</Text>
        <Text style={styles.bullet}>• ご相談の窓口と次のステップ</Text>
      </View>

      <Text style={styles.tagline}>WEB施工証明書SaaS — Ledra</Text>
      <Footer pageLabel="1 / 4" />
    </Page>
  );
}

function Page2Problems() {
  return (
    <Page size="A4" style={styles.page}>
      <Text style={styles.pageTitle}>01  PROBLEM</Text>
      <View style={styles.gradientBar} />
      <Text style={styles.h1}>いま、施工現場の記録に起きていること</Text>
      <Text style={styles.lead}>
        職人の仕事は確かでも、その確かさを「あとから証明できない」という課題が業界全体に残っています。
      </Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>① 伝わらない摩擦</Text>
        <Text style={styles.cardDesc}>
          紙・個人スマホ・Excel に散在する施工記録。同じ精度で顧客・保険会社・次の担当者に届ける共通フォーマットがない。
        </Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>② 消える摩擦</Text>
        <Text style={styles.cardDesc}>
          紙はなくなり、担当者は変わる。3年後に「この車両に何の施工をしたか」を確実に答えられる記録が残っていない。
        </Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>③ 疑われる摩擦</Text>
        <Text style={styles.cardDesc}>
          事故や事後対応の場面で、「本当にその時の写真か」「あとから直していないか」という不信に、紙やスマホ写真では十分答えられない。
        </Text>
      </View>

      <Text style={[styles.lead, { marginTop: 18 }]}>
        Ledra はこの3つの摩擦を、記録の「かたち」だけを変えることで解きます。
      </Text>

      <Footer pageLabel="2 / 4" />
    </Page>
  );
}

function Page3Features() {
  return (
    <Page size="A4" style={styles.page}>
      <Text style={styles.pageTitle}>02  WHAT IT DELIVERS</Text>
      <View style={styles.gradientBar} />
      <Text style={styles.h1}>Ledra が提供するもの</Text>
      <Text style={styles.lead}>
        施工証明だけではありません。現場の1日の時間の形全体を穏やかに更新します。
      </Text>

      <View style={styles.grid2}>
        <View style={styles.gridItem}>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>デジタル施工証明書</Text>
            <Text style={styles.cardDesc}>
              写真・施工内容・施工者・日時を、ワンクリックで発行。QRコードで顧客に即共有。
            </Text>
          </View>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>車両・顧客 360° ビュー</Text>
            <Text style={styles.cardDesc}>
              1台・1人の履歴を、証明書・予約・請求までタイムラインで横断参照。
            </Text>
          </View>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>POS・請求書・予約</Text>
            <Text style={styles.cardDesc}>
              Tap to Pay 決済、請求書 PDF 自動生成、Google Calendar 同期。
            </Text>
          </View>
        </View>
        <View style={styles.gridItem}>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>保険・代理店連携</Text>
            <Text style={styles.cardDesc}>
              保険会社ポータルで検索・査定・案件管理。代理店ポータルで紹介・コミッション管理。
            </Text>
          </View>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>改ざん防止（Polygon anchoring / C2PA）</Text>
            <Text style={styles.cardDesc}>
              証明書ハッシュを Polygon に刻印。施工写真には C2PA 署名を付与。第三者が独立に検証可能。
            </Text>
          </View>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>既存ツールとの連携</Text>
            <Text style={styles.cardDesc}>
              Stripe / Square / Google Calendar / LINE / CloudSign と接続。置き換えではなく、橋渡し。
            </Text>
          </View>
        </View>
      </View>

      <Footer pageLabel="3 / 4" />
    </Page>
  );
}

function Page4NextSteps() {
  return (
    <Page size="A4" style={styles.page}>
      <Text style={styles.pageTitle}>03  NEXT STEPS</Text>
      <View style={styles.gradientBar} />
      <Text style={styles.h1}>次のステップ</Text>
      <Text style={styles.lead}>
        無料プランから始められます。導入支援・トレーニングは担当チームが伴走します。
      </Text>

      <Text style={styles.h2}>導入プログラム（標準4〜6週間）</Text>
      <Text style={styles.bullet}>1. キックオフ・業務棚卸し（1週目）</Text>
      <Text style={styles.bullet}>2. データ移行・メニュー登録（1〜2週目）</Text>
      <Text style={styles.bullet}>3. テナント初期設定（2週目）</Text>
      <Text style={styles.bullet}>4. 現場トレーニング（3週目）</Text>
      <Text style={styles.bullet}>5. ローンチ・運用定着（4週目以降）</Text>

      <Text style={styles.h2}>ご相談の窓口</Text>
      <Text style={styles.body}>
        Web: https://ledra.co.jp/contact
      </Text>
      <Text style={styles.body}>
        Email: info@ledra.co.jp
      </Text>
      <Text style={styles.body}>
        資料一覧: https://ledra.co.jp/resources
      </Text>
      <Text style={styles.body}>
        ROIシミュレーター: https://ledra.co.jp/roi
      </Text>

      <Text style={[styles.tagline, { marginTop: 40 }]}>
        記録を、業界の共通言語にする。
      </Text>
      <Text style={[styles.body, { color: colors.mute2, marginTop: 4 }]}>
        — Ledra チーム
      </Text>

      <Footer pageLabel="4 / 4" />
    </Page>
  );
}

export function ServiceOverviewPdf() {
  ensureFonts();
  return (
    <Document
      title="Ledra サービス概要"
      author="Ledra"
      subject="WEB施工証明書SaaS サービス概要資料"
      creator="Ledra"
      producer="Ledra"
    >
      {Page1Cover()}
      {Page2Problems()}
      {Page3Features()}
      {Page4NextSteps()}
    </Document>
  );
}

/**
 * Registry of available marketing PDFs. Add entries here to expose new
 * downloadable resources; the API route `/api/marketing/resources/[key]/pdf`
 * reads from this map.
 */
export const RESOURCE_PDFS: Record<string, { filename: string; doc: () => React.ReactElement }> = {
  "service-overview": {
    filename: "Ledra_Service_Overview.pdf",
    doc: () => <ServiceOverviewPdf />,
  },
};
