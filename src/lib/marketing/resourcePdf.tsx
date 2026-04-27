/**
 * Marketing resource PDFs — generated server-side via @react-pdf/renderer.
 *
 * Add new PDFs by exporting a Document component and registering it in
 * `RESOURCE_PDFS` below. The API route `/api/marketing/resources/[key]/pdf`
 * reads the registry.
 */

import React from "react";
import { Document, Page, Text, View, StyleSheet, Font, type DocumentProps } from "@react-pdf/renderer";
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
    fontSize: 8,
    color: colors.accent,
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: 3,
    paddingHorizontal: 5,
    paddingVertical: 1,
    marginBottom: 6,
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border,
    paddingVertical: 5,
  },
  tableHead: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: colors.accent,
    paddingBottom: 5,
    marginTop: 8,
  },
  th: {
    fontSize: 9,
    fontWeight: 700,
    color: colors.mute,
  },
  td: {
    fontSize: 9.5,
    color: "#c8cfdd",
    lineHeight: 1.5,
  },
  col1: { flex: 2 },
  col2: { flex: 1, textAlign: "right" },
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
        {pageLabel} · 更新: {updated}
      </Text>
    </View>
  );
}

function Page1Cover() {
  return (
    <Page size="A4" style={styles.page}>
      <Text style={styles.pageTitle}>SERVICE OVERVIEW</Text>
      <View style={styles.gradientBar} />
      <Text style={styles.h1}>記録を、業界の共通言語にする。</Text>
      <Text style={styles.lead}>
        Ledra
        は、自動車施工（コーティング・フィルム・ラッピング・板金・整備）の記録を、改ざん不可能なデジタル証明書として発行・共有する
        WEB 施工証明書 SaaS です。
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
      <Text style={styles.pageTitle}>01 PROBLEM</Text>
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
      <Text style={styles.pageTitle}>02 WHAT IT DELIVERS</Text>
      <View style={styles.gradientBar} />
      <Text style={styles.h1}>Ledra が提供するもの</Text>
      <Text style={styles.lead}>施工証明だけではありません。現場の1日の時間の形全体を穏やかに更新します。</Text>

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
            <Text style={styles.cardDesc}>1台・1人の履歴を、証明書・予約・請求までタイムラインで横断参照。</Text>
          </View>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>POS・請求書・予約</Text>
            <Text style={styles.cardDesc}>Tap to Pay 決済、請求書 PDF 自動生成、Google Calendar 同期。</Text>
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
              施工写真の SHA-256 ハッシュを Polygon に刻印。写真には C2PA 署名も付与。第三者が独立に検証可能。
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
      <Text style={styles.pageTitle}>03 NEXT STEPS</Text>
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

/* ══════════════════════════════════════════════════════════════════
 * Pricing Overview — 料金プラン詳細資料
 * ══════════════════════════════════════════════════════════════════ */

function PricingCover() {
  const pageTotal = 5;
  return (
    <Page size="A4" style={styles.page}>
      <Text style={styles.pageTitle}>PRICING OVERVIEW</Text>
      <View style={styles.gradientBar} />
      <Text style={styles.h1}>料金プラン詳細</Text>
      <Text style={styles.lead}>
        Ledra
        の各プランに含まれる機能・対応件数・サポート範囲・オプション料金・キャンペーン情報を、見積提示にそのまま使える粒度でまとめた一次資料です。
      </Text>

      <View style={[styles.card, { marginTop: 18 }]}>
        <Text style={styles.cardTitle}>この資料の構成</Text>
        <Text style={styles.bullet}>• 4プラン（フリー / スターター / スタンダード / プロ）の料金と上限</Text>
        <Text style={styles.bullet}>• 機能別比較表（10項目）</Text>
        <Text style={styles.bullet}>• ブランド証明書テンプレートのオプション料金</Text>
        <Text style={styles.bullet}>• 追加店舗・ユーザー・サポート等のオプション料金</Text>
        <Text style={styles.bullet}>• NFCタグ価格と初期100店舗限定キャンペーン</Text>
      </View>

      <View style={[styles.card, { marginTop: 12 }]}>
        <Text style={styles.cardTitle}>料金の基本方針</Text>
        <Text style={styles.cardDesc}>
          ・すべて月額税抜表示（別途消費税）。年間契約で{ANNUAL_DISCOUNT_PERCENT}%割引。{"\n"}
          ・証明書発行数はプラン上限内であれば追加料金なし。{"\n"}
          ・フリープランはクレジットカード登録不要でご利用いただけます。
        </Text>
      </View>

      <Text style={styles.tagline}>記録を、業界の共通言語にする。</Text>
      <Footer pageLabel={`1 / ${pageTotal}`} />
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
    <View style={[styles.card, { padding: 12, marginVertical: 4 }]}>
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
  const pageTotal = 5;
  return (
    <Page size="A4" style={styles.page}>
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

      <Footer pageLabel={`2 / ${pageTotal}`} />
    </Page>
  );
}

function PricingComparison() {
  const pageTotal = 5;
  return (
    <Page size="A4" style={styles.page}>
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
          <Text style={[styles.td, { flex: 2.4 }]}>{row.feature}</Text>
          <Text style={[styles.td, { flex: 1, textAlign: "right" }]}>{row.free}</Text>
          <Text style={[styles.td, { flex: 1, textAlign: "right" }]}>{row.starter}</Text>
          <Text style={[styles.td, { flex: 1.2, textAlign: "right" }]}>{row.standard}</Text>
          <Text style={[styles.td, { flex: 1, textAlign: "right" }]}>{row.pro}</Text>
        </View>
      ))}

      <Text style={[styles.h2, { marginTop: 22 }]}>料金の適用ルール</Text>
      <Text style={styles.bullet}>• 年間契約で{ANNUAL_DISCOUNT_PERCENT}%割引（月額換算比）。</Text>
      <Text style={styles.bullet}>• 上限超過は翌月以降の上位プラン移行を推奨。当月の発行停止はありません。</Text>
      <Text style={styles.bullet}>• プラン間のアップグレードはいつでも可能（日割り計算）。</Text>
      <Text style={styles.bullet}>• ダウングレードは次回更新時から適用されます。</Text>

      <Footer pageLabel={`3 / ${pageTotal}`} />
    </Page>
  );
}

function PricingTemplateAndAddons() {
  const pageTotal = 5;
  return (
    <Page size="A4" style={styles.page}>
      <Text style={styles.pageTitle}>03 TEMPLATE & OPTIONS</Text>
      <View style={styles.gradientBar} />
      <Text style={styles.h1}>テンプレートとオプション</Text>

      <Text style={styles.h2}>ブランド証明書テンプレート</Text>
      <View style={styles.grid2}>
        <View style={styles.gridItem}>
          <View style={styles.card}>
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
          <View style={styles.card}>
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

      <Footer pageLabel={`4 / ${pageTotal}`} />
    </Page>
  );
}

function PricingCampaignAndNfc() {
  const pageTotal = 5;
  return (
    <Page size="A4" style={styles.page}>
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
      <View style={styles.card}>
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

      <Footer pageLabel={`5 / ${pageTotal}`} />
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
      {PricingPlans()}
      {PricingComparison()}
      {PricingTemplateAndAddons()}
      {PricingCampaignAndNfc()}
    </Document>
  );
}

/* ══════════════════════════════════════════════════════════════════
 * Features Deep Dive — 機能紹介資料
 * ══════════════════════════════════════════════════════════════════ */

function FeaturesCover() {
  const pageTotal = 2 + FEATURE_GROUPS.length + 1;
  return (
    <Page size="A4" style={styles.page}>
      <Text style={styles.pageTitle}>FEATURES DEEP DIVE</Text>
      <View style={styles.gradientBar} />
      <Text style={styles.h1}>Ledra 機能紹介</Text>
      <Text style={styles.lead}>
        証明書発行から、車両・顧客管理、POS・帳票、経営分析、保険・代理店連携まで。Ledra
        の全機能を、役割横断でご紹介します。
      </Text>

      <View style={[styles.card, { marginTop: 18 }]}>
        <Text style={styles.cardTitle}>本資料の読み方</Text>
        <Text style={styles.bullet}>• 7カテゴリ、合計約30の機能を、業務の順番に沿って並べています。</Text>
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
      <Footer pageLabel={`1 / ${pageTotal}`} />
    </Page>
  );
}

function FeaturesFourPortal() {
  const pageTotal = 2 + FEATURE_GROUPS.length + 1;
  return (
    <Page size="A4" style={styles.page}>
      <Text style={styles.pageTitle}>00 OVERVIEW</Text>
      <View style={styles.gradientBar} />
      <Text style={styles.h1}>ひとつの記録を、4ポータルで共有</Text>
      <Text style={styles.lead}>
        施工店・代理店・保険会社・顧客は、同じ「事実」を役割に応じた最適な形で受け取ります。
      </Text>

      <View style={styles.grid2}>
        <View style={styles.gridItem}>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Admin（施工店）</Text>
            <Text style={styles.cardDesc}>
              証明書の発行・管理、車両・顧客、予約・作業・POS・請求、経営ダッシュボード。現場運用の中心。
            </Text>
          </View>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Insurer（保険会社）</Text>
            <Text style={styles.cardDesc}>
              証明書の検索・照会、案件管理、地域別・パートナー別の集計分析。査定の一次資料として。
            </Text>
          </View>
        </View>
        <View style={styles.gridItem}>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Agent（代理店）</Text>
            <Text style={styles.cardDesc}>
              施工店の紹介、コミッション管理、電子署名による契約締結、担当施工店のパフォーマンスレポート。
            </Text>
          </View>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Customer（顧客）</Text>
            <Text style={styles.cardDesc}>
              受け取った証明書をスマホで閲覧・共有。QR/URL/NFC の3経路でアクセス。車両の過去履歴も確認。
            </Text>
          </View>
        </View>
      </View>

      <Text style={[styles.h2, { marginTop: 12 }]}>共通する設計思想</Text>
      <Text style={styles.bullet}>• 「記録は1つ・見え方は4つ」。同じ証明書を役割ごとに最適化して提示。</Text>
      <Text style={styles.bullet}>• RLS（行レベルセキュリティ）で、役割に応じて自動的に見える範囲を絞り込み。</Text>
      <Text style={styles.bullet}>• 4ポータル間の権限委譲・切替はワンクリック。テナント境界は常に明確。</Text>

      <Footer pageLabel={`2 / ${pageTotal}`} />
    </Page>
  );
}

function FeatureGroupPage({ group, index, pageTotal }: { group: FeatureGroup; index: number; pageTotal: number }) {
  return (
    <Page size="A4" style={styles.page}>
      <Text style={styles.pageTitle}>
        {String(index + 1).padStart(2, "0")} {group.title.toUpperCase()}
      </Text>
      <View style={styles.gradientBar} />
      <Text style={styles.h1}>{group.title}</Text>
      <Text style={[styles.lead, { marginBottom: 10 }]}>{group.subtitle}</Text>

      <View style={styles.grid2}>
        <View style={styles.gridItem}>
          {group.features
            .filter((_, i) => i % 2 === 0)
            .map((f) => (
              <View key={f.title} style={styles.card}>
                <Text style={styles.cardTitle}>{f.title}</Text>
                <Text style={styles.cardDesc}>{f.description}</Text>
              </View>
            ))}
        </View>
        <View style={styles.gridItem}>
          {group.features
            .filter((_, i) => i % 2 === 1)
            .map((f) => (
              <View key={f.title} style={styles.card}>
                <Text style={styles.cardTitle}>{f.title}</Text>
                <Text style={styles.cardDesc}>{f.description}</Text>
              </View>
            ))}
        </View>
      </View>

      <Footer pageLabel={`${index + 3} / ${pageTotal}`} />
    </Page>
  );
}

function FeaturesClosing() {
  const pageTotal = 2 + FEATURE_GROUPS.length + 1;
  return (
    <Page size="A4" style={styles.page}>
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
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Q. 既存の顧客・車両データは移行できますか？</Text>
        <Text style={styles.cardDesc}>
          はい。CSV インポート機能で一括移行可能です。テンプレートをお渡ししますので、移行作業は平均
          1〜2日で完了します。
        </Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Q. 現場スタッフへの教育はどのくらい必要ですか？</Text>
        <Text style={styles.cardDesc}>
          タブレット/スマホ前提の UI なので、初回 30 分のトレーニングで発行フローに慣れていただけます。
        </Text>
      </View>
      <View style={styles.card}>
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

      <Footer pageLabel={`${pageTotal} / ${pageTotal}`} />
    </Page>
  );
}

export function FeaturesDeepDivePdf() {
  ensureFonts();
  const pageTotal = 2 + FEATURE_GROUPS.length + 1;
  return (
    <Document
      title="Ledra 機能紹介資料"
      author="Ledra"
      subject="Ledra の全機能をカテゴリ別に紹介する資料"
      creator="Ledra"
      producer="Ledra"
    >
      {FeaturesCover()}
      {FeaturesFourPortal()}
      {FEATURE_GROUPS.map((g, i) => (
        <React.Fragment key={g.id}>{FeatureGroupPage({ group: g, index: i, pageTotal })}</React.Fragment>
      ))}
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
        desc: "Supabase Postgres はディスク暗号化 (AES-256) および自動鍵ローテーションを実装。オブジェクトストレージも転送時・保管時ともに暗号化。",
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
        desc: "顧客ポータルは専用のセッション有効期限 (デフォルト24時間)。署名付き URL は1回限りのトークンで発行。",
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
        desc: "発行時に証明書コンテンツのハッシュを Polygon に刻印。後からデータが書き換えられても、チェーン上のアンカーとの差分で検知できます。",
      },
      {
        title: "デジタル署名",
        desc: "証明書 PDF には Ledra の署名鍵で署名を付与。発行元の同一性を第三者が検証可能。",
      },
    ],
  },
];

const SECURITY_PAGE_TOTAL = 1 + 1 + SECURITY_BLOCKS.length + 3; // cover + 3-layer + 5 blocks + polygon + lifecycle + close

function SecurityCover() {
  return (
    <Page size="A4" style={styles.page}>
      <Text style={styles.pageTitle}>SECURITY WHITEPAPER</Text>
      <View style={styles.gradientBar} />
      <Text style={styles.h1}>Ledra セキュリティ ホワイトペーパー</Text>
      <Text style={styles.lead}>
        暗号化・アクセス制御・バックアップ・脆弱性対応・改ざん防止。
        記録の信頼を仕組みで守るための、技術担当者・情報セキュリティ担当者向け一次資料です。
      </Text>

      <View style={[styles.card, { marginTop: 16 }]}>
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
      <Footer pageLabel={`1 / ${SECURITY_PAGE_TOTAL}`} />
    </Page>
  );
}

function SecurityLayers() {
  return (
    <Page size="A4" style={styles.page}>
      <Text style={styles.pageTitle}>00 LAYER MODEL</Text>
      <View style={styles.gradientBar} />
      <Text style={styles.h1}>セキュリティ3層モデル</Text>
      <Text style={styles.lead}>
        通信・保存・ペイロードの3層で、独立に働く防御を重ねています。どれか1層が突破されても、他の層で被害を局所化する設計です。
      </Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>層1: 通信 (Transport)</Text>
        <Text style={styles.cardDesc}>
          TLS 1.2+ による経路全体の暗号化。HSTS により HTTPS ダウングレードを防止。内部サービス間も mTLS
          相当の境界で分離。
        </Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>層2: 保存 (At-Rest)</Text>
        <Text style={styles.cardDesc}>
          Postgres は AES-256
          によるディスク暗号化。オブジェクトストレージは転送時・保管時ともに暗号化。バックアップも同様の暗号化を継承。
        </Text>
      </View>
      <View style={styles.card}>
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

      <Footer pageLabel={`2 / ${SECURITY_PAGE_TOTAL}`} />
    </Page>
  );
}

function SecurityBlockPage({ block, index }: { block: SecurityBlock; index: number }) {
  return (
    <Page size="A4" style={styles.page}>
      <Text style={styles.pageTitle}>
        {String(index + 1).padStart(2, "0")} {block.title.replace(/^\d+\.\s*/, "").toUpperCase()}
      </Text>
      <View style={styles.gradientBar} />
      <Text style={styles.h1}>{block.title}</Text>
      <Text style={[styles.lead, { marginBottom: 10 }]}>{block.lead}</Text>

      {block.items.map((it) => (
        <View key={it.title} style={styles.card}>
          <Text style={styles.cardTitle}>{it.title}</Text>
          <Text style={styles.cardDesc}>{it.desc}</Text>
        </View>
      ))}

      <Footer pageLabel={`${index + 3} / ${SECURITY_PAGE_TOTAL}`} />
    </Page>
  );
}

function SecurityPolygonFlow() {
  const n = 3 + SECURITY_BLOCKS.length;
  return (
    <Page size="A4" style={styles.page}>
      <Text style={styles.pageTitle}>06 POLYGON ANCHORING</Text>
      <View style={styles.gradientBar} />
      <Text style={styles.h1}>Polygon anchoring フロー</Text>
      <Text style={styles.lead}>証明書発行時のハッシュ刻印から、第三者による独立検証までの一連の流れです。</Text>

      <Text style={styles.h2}>発行フロー（書き込み側）</Text>
      <Text style={styles.bullet}>
        1. 証明書コンテンツ（写真 / 施工内容 / 施工者 / 日時）を正準化し、SHA-256 で確定値を算出。
      </Text>
      <Text style={styles.bullet}>
        2. ハッシュを Ledra の anchoring キューに投入。バッチで Polygon PoS の anchoring コントラクトに送信。
      </Text>
      <Text style={styles.bullet}>
        3. トランザクションハッシュと block number を証明書レコードに記録。UI の「検証済」バッジが点灯。
      </Text>

      <Text style={styles.h2}>検証フロー（読み取り側）</Text>
      <Text style={styles.bullet}>1. 任意の第三者が証明書コンテンツと記録済みトランザクションを取得。</Text>
      <Text style={styles.bullet}>2. 手元でコンテンツを同じ正準化手順で SHA-256 計算。</Text>
      <Text style={styles.bullet}>3. Polygon 上の anchoring コントラクトに読み出し、ハッシュ一致を確認。</Text>

      <View style={[styles.card, { marginTop: 10 }]}>
        <Text style={styles.cardTitle}>設計上の要点</Text>
        <Text style={styles.bullet}>• Ledra 側 DB が改変されても、Polygon 上の記録との比較で検知可能。</Text>
        <Text style={styles.bullet}>• 写真そのものは C2PA 署名で独立検証。チェーン上にはハッシュのみ記録。</Text>
        <Text style={styles.bullet}>• ガス代高騰時に備え、バッチ Merkle 化で個別トランザクション数を抑制。</Text>
      </View>

      <Footer pageLabel={`${n} / ${SECURITY_PAGE_TOTAL}`} />
    </Page>
  );
}

function SecurityDataLifecycle() {
  const n = 4 + SECURITY_BLOCKS.length;
  return (
    <Page size="A4" style={styles.page}>
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
      <Text style={styles.bullet}>• 退会時はテナント単位で論理削除 → 30 日後に物理削除。</Text>
      <Text style={styles.bullet}>• 個別の顧客情報削除依頼は、本人確認後 30 日以内に対応。</Text>
      <Text style={styles.bullet}>• 全データの CSV / JSON エクスポートは、Admin 権限者がいつでも取得可能。</Text>

      <Footer pageLabel={`${n} / ${SECURITY_PAGE_TOTAL}`} />
    </Page>
  );
}

function SecurityClosing() {
  return (
    <Page size="A4" style={styles.page}>
      <Text style={styles.pageTitle}>08 COMPLIANCE & CONTACT</Text>
      <View style={styles.gradientBar} />
      <Text style={styles.h1}>認証・インシデント対応・お問い合わせ</Text>

      <Text style={styles.h2}>認証取得状況</Text>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>ISMS (ISO/IEC 27001)</Text>
        <Text style={styles.cardDesc}>
          取得準備中。取得時期は本ホワイトペーパーおよび /security ページにて告知します。
        </Text>
      </View>
      <View style={styles.card}>
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

      <Footer pageLabel={`${SECURITY_PAGE_TOTAL} / ${SECURITY_PAGE_TOTAL}`} />
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
      {SecurityLayers()}
      {SECURITY_BLOCKS.map((b, i) => (
        <React.Fragment key={b.id}>{SecurityBlockPage({ block: b, index: i })}</React.Fragment>
      ))}
      {SecurityPolygonFlow()}
      {SecurityDataLifecycle()}
      {SecurityClosing()}
    </Document>
  );
}

/* ══════════════════════════════════════════════════════════════════
 * Case Studies — 導入事例集（パイロット版）
 * ══════════════════════════════════════════════════════════════════ */

/**
 * Page total for the case-studies PDF is dynamic because the "Published
 * cases" page only appears when there is at least one live MDX entry.
 *
 * Static layout (no published cases): 2 framing + 5 industry patterns
 * + pilot program + closing = 9.
 */
function casesPageTotal(publishedCount: number): number {
  return 9 + (publishedCount > 0 ? 1 : 0);
}

function CasesCover({ pageTotal }: { pageTotal: number }) {
  return (
    <Page size="A4" style={styles.page}>
      <Text style={styles.pageTitle}>CASE STUDIES</Text>
      <View style={styles.gradientBar} />
      <Text style={styles.h1}>導入事例集（パイロット版）</Text>
      <Text style={styles.lead}>
        Ledra
        は正式サービスを開始したばかりです。本資料は、先行導入いただくパイロット企業様の事例をどのように記録・共有していくのか、そしてどんな指標で変化を語っていくのかを整理した、サービス現在地のスナップショットです。
      </Text>

      <View style={[styles.card, { marginTop: 14 }]}>
        <Text style={styles.cardTitle}>本資料の立ち位置</Text>
        <Text style={styles.bullet}>• 事例は随時アップデート。公開次第、本資料 v1.x として差し替えます。</Text>
        <Text style={styles.bullet}>• 現時点では、業界別の典型的な導入パターンと計測フレームを提示します。</Text>
        <Text style={styles.bullet}>• 実在の数値はパイロット企業様の同意取得後に順次反映します。</Text>
      </View>

      <View style={[styles.card, { marginTop: 10 }]}>
        <Text style={styles.cardTitle}>このドキュメントで得られる情報</Text>
        <Text style={styles.bullet}>• 事例で扱う定量・定性指標（6種類）</Text>
        <Text style={styles.bullet}>• 5業種（コーティング / フィルム / ラッピング / 板金 / 整備）での変化パターン</Text>
        <Text style={styles.bullet}>• パイロット参加の流れと、Ledra による伴走内容</Text>
        <Text style={styles.bullet}>• 事例取材・公開までのタイムライン</Text>
      </View>

      <Text style={styles.tagline}>あなたの1社目が、業界の記録文化を作る。</Text>
      <Footer pageLabel={`1 / ${pageTotal}`} />
    </Page>
  );
}

function CasesMetrics({ pageTotal }: { pageTotal: number }) {
  return (
    <Page size="A4" style={styles.page}>
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

      <Footer pageLabel={`2 / ${pageTotal}`} />
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

function CasesIndustryPatternPage({
  pattern,
  index,
  pageTotal,
}: {
  pattern: IndustryPattern;
  index: number;
  pageTotal: number;
}) {
  return (
    <Page size="A4" style={styles.page}>
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
        ※ 上記はパイロット設計段階での想定パターンです。実数値は実施企業様ごとに異なります。
      </Text>

      <Footer pageLabel={`${index + 3} / ${pageTotal}`} />
    </Page>
  );
}

function CasesPilotProgram({ pageNumber, pageTotal }: { pageNumber: number; pageTotal: number }) {
  return (
    <Page size="A4" style={styles.page}>
      <Text style={styles.pageTitle}>{String(pageNumber).padStart(2, "0")} PILOT PROGRAM</Text>
      <View style={styles.gradientBar} />
      <Text style={styles.h1}>パイロット参加の流れ</Text>
      <Text style={[styles.lead, { marginBottom: 10 }]}>
        事例記事は Ledra 編集部が伴走して制作します。貴社の追加負担なく、業界への発信素材としてご活用いただけます。
      </Text>

      <Text style={styles.h2}>3ステップ</Text>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Step 1: 事前ヒアリング（約 60 分）</Text>
        <Text style={styles.cardDesc}>
          貴社の現状業務・課題・数値の捉え方をお聞きし、事例で扱う指標と取材範囲を合意します。
        </Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Step 2: 導入・運用定着（約 4〜12 週）</Text>
        <Text style={styles.cardDesc}>
          通常の導入支援と並行して、before の数値を記録。運用定着後、after の数値を同じ基準で採集します。
        </Text>
      </View>
      <View style={styles.card}>
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

      <Footer pageLabel={`${pageNumber} / ${pageTotal}`} />
    </Page>
  );
}

function CasesClosing({ pageTotal }: { pageTotal: number }) {
  return (
    <Page size="A4" style={styles.page}>
      <Text style={styles.pageTitle}>{String(pageTotal).padStart(2, "0")} NEXT STEPS</Text>
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

      <View style={[styles.card, { marginTop: 16 }]}>
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

      <Footer pageLabel={`${pageTotal} / ${pageTotal}`} />
    </Page>
  );
}

function CasesPublishedPage({
  cases,
  pageNumber,
  pageTotal,
}: {
  cases: ContentEntry[];
  pageNumber: number;
  pageTotal: number;
}) {
  return (
    <Page size="A4" style={styles.page}>
      <Text style={styles.pageTitle}>{String(pageNumber).padStart(2, "0")} PUBLISHED CASES</Text>
      <View style={styles.gradientBar} />
      <Text style={styles.h1}>公開済みの導入事例</Text>
      <Text style={[styles.lead, { marginBottom: 10 }]}>
        パイロット企業様の許諾のもと、/cases ページに公開しているケーススタディの一覧です。最新の全文は Web
        でお読みください。
      </Text>

      {cases.map((c) => (
        <View key={c.frontmatter.slug} style={styles.card}>
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
      <Footer pageLabel={`${pageNumber} / ${pageTotal}`} />
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

  const hasPublished = cases.length > 0;
  const pageTotal = casesPageTotal(cases.length);
  // Fixed layout: cover(1), metrics(2), 5 industry patterns(3-7),
  // optional published(8), pilot(8 or 9), closing(9 or 10).
  const publishedNo = hasPublished ? 8 : null;
  const pilotNo = hasPublished ? 9 : 8;

  return (
    <Document
      title="Ledra 導入事例集（パイロット版）"
      author="Ledra"
      subject="Ledra 導入事例のフレームワークとパイロット参加のご案内"
      creator="Ledra"
      producer="Ledra"
    >
      {CasesCover({ pageTotal })}
      {CasesMetrics({ pageTotal })}
      {INDUSTRY_PATTERNS.map((p, i) => (
        <React.Fragment key={p.industry}>
          {CasesIndustryPatternPage({ pattern: p, index: i, pageTotal })}
        </React.Fragment>
      ))}
      {hasPublished && publishedNo !== null ? CasesPublishedPage({ cases, pageNumber: publishedNo, pageTotal }) : null}
      {CasesPilotProgram({ pageNumber: pilotNo, pageTotal })}
      {CasesClosing({ pageTotal })}
    </Document>
  );
}

/* ══════════════════════════════════════════════════════════════════
 * ROI Worksheet — ROI シミュレーション計算テンプレート
 * ══════════════════════════════════════════════════════════════════ */

const ROI_PAGE_TOTAL = 7;
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
    <Page size="A4" style={styles.page}>
      <Text style={styles.pageTitle}>ROI WORKSHEET</Text>
      <View style={styles.gradientBar} />
      <Text style={styles.h1}>ROI シミュレーション 計算テンプレート</Text>
      <Text style={styles.lead}>
        月間の施工証明書発行数・1件あたりの事務時間・書類再発行コストから、Ledra
        導入時の年間削減効果を試算するための計算テンプレートです。経営会議・社内稟議の一次資料としてご活用ください。
      </Text>

      <View style={[styles.card, { marginTop: 14 }]}>
        <Text style={styles.cardTitle}>この資料の使い方</Text>
        <Text style={styles.bullet}>• P.2 の計算式を読み、前提を確認。</Text>
        <Text style={styles.bullet}>• P.3 の記入欄に貴社の数値を書き込む。</Text>
        <Text style={styles.bullet}>• P.4 の3つのロス別モデルで、どこが大きいか把握。</Text>
        <Text style={styles.bullet}>• P.5〜P.6 の代表スケールと比較し、推定の妥当性を確認。</Text>
        <Text style={styles.bullet}>• P.7 の依頼フォーマットで個別ヒアリング試算を依頼。</Text>
      </View>

      <View style={[styles.card, { marginTop: 10 }]}>
        <Text style={styles.cardTitle}>WEB 版シミュレーター</Text>
        <Text style={styles.cardDesc}>
          リアルタイムで再計算したい場合は Web 版をご利用ください: https://ledra.co.jp/roi{"\n"}本 PDF
          はオフラインでの共有・印刷用の簡略版です。
        </Text>
      </View>

      <Text style={styles.tagline}>数字で語れる一歩を、最小の時間で。</Text>
      <Footer pageLabel={`1 / ${ROI_PAGE_TOTAL}`} />
    </Page>
  );
}

function RoiFormula() {
  return (
    <Page size="A4" style={styles.page}>
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
      <View style={styles.card}>
        <Text style={styles.cardTitle}>年間 節約時間（時）</Text>
        <Text style={styles.cardDesc}>= A × (B − {ROI_AFTER_MIN_PER_CERT}) × 12 ÷ 60</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>年間 人件費削減額（円）</Text>
        <Text style={styles.cardDesc}>= 年間 節約時間 × C</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>年間 再発行/紛失対応削減額（円）</Text>
        <Text style={styles.cardDesc}>= D × 0.8</Text>
      </View>
      <View style={[styles.card, { borderColor: colors.accent }]}>
        <Text style={styles.cardTitle}>年間 総削減額（円）</Text>
        <Text style={styles.cardDesc}>= 年間 人件費削減額 + 年間 再発行/紛失対応削減額</Text>
      </View>

      <Text style={[styles.cardDesc, { marginTop: 8 }]}>
        ※ Ledra 導入後の1件あたり事務時間は {ROI_AFTER_MIN_PER_CERT} 分として固定（他社平均）。 ※ 再発行削減係数 0.8
        は、顧客ポータル・QR による自己解決率の実績値を保守的に適用。
      </Text>

      <Footer pageLabel={`2 / ${ROI_PAGE_TOTAL}`} />
    </Page>
  );
}

function RoiWorksheet() {
  const blankLine = "_______________________________";
  return (
    <Page size="A4" style={styles.page}>
      <Text style={styles.pageTitle}>02 WORKSHEET</Text>
      <View style={styles.gradientBar} />
      <Text style={styles.h1}>記入シート</Text>
      <Text style={[styles.lead, { marginBottom: 10 }]}>
        以下の空欄に、貴社の概算値を書き込んでください。概算で構いません。
      </Text>

      <Text style={styles.h2}>入力</Text>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>A. 月間の施工証明書発行数</Text>
        <Text style={styles.body}>{blankLine} 件 / 月</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>B. 1件あたりの事務時間（現状）</Text>
        <Text style={styles.body}>{blankLine} 分 / 件</Text>
        <Text style={styles.cardDesc}>例: 写真整理 + Excel 入力 + 印刷 + 封入 + 保管のすべて合算</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>C. 担当者の時給相当</Text>
        <Text style={styles.body}>{blankLine} 円 / 時</Text>
        <Text style={styles.cardDesc}>月給 ÷ 160 を目安に。社会保険等を含める場合は月給×1.25 ÷ 160。</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>D. 書類再発行・紛失対応の年間コスト</Text>
        <Text style={styles.body}>{blankLine} 円 / 年</Text>
      </View>

      <Text style={styles.h2}>計算結果（記入欄）</Text>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>年間 節約時間</Text>
        <Text style={styles.body}>{blankLine} 時間</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>年間 人件費削減額</Text>
        <Text style={styles.body}>{blankLine} 円</Text>
      </View>
      <View style={[styles.card, { borderColor: colors.accent }]}>
        <Text style={styles.cardTitle}>年間 総削減額</Text>
        <Text style={styles.body}>{blankLine} 円</Text>
      </View>

      <Footer pageLabel={`3 / ${ROI_PAGE_TOTAL}`} />
    </Page>
  );
}

function RoiLossModel() {
  return (
    <Page size="A4" style={styles.page}>
      <Text style={styles.pageTitle}>03 LOSS MODEL</Text>
      <View style={styles.gradientBar} />
      <Text style={styles.h1}>3つのロスの換算モデル</Text>
      <Text style={[styles.lead, { marginBottom: 10 }]}>
        Ledra が解消する業務ロスは大きく3種類。自社でどのロスが大きいかを見極める参考に。
      </Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>ロス1: 事務時間のロス</Text>
        <Text style={styles.cardDesc}>
          紙・Excel での作成・郵送・保管・検索にかかる時間。変数 A × B を中心に算出。Ledra では1件
          {ROI_AFTER_MIN_PER_CERT} 分相当に短縮（入力・QR 送付のみ）。
        </Text>
        <Text style={[styles.cardDesc, { marginTop: 4 }]}>
          金額化: 節約時間 × 変数 C（時給）。繁忙期の残業代単価を使うとより実態に近い数値に。
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>ロス2: 再発行のロス</Text>
        <Text style={styles.cardDesc}>
          紛失・問い合わせ・再発行・郵送のコスト。変数 D。Ledra 導入後は顧客ポータル・QR
          による自己解決が大半となり、保守的に 80% 削減として試算。
        </Text>
        <Text style={[styles.cardDesc, { marginTop: 4 }]}>
          金額化: D × 0.8。郵送費・封筒代・人件費の合算で見積もると実効値が取りやすい。
        </Text>
      </View>

      <View style={styles.card}>
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

      <Footer pageLabel={`4 / ${ROI_PAGE_TOTAL}`} />
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
    <Page size="A4" style={styles.page}>
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
        ※ 数値はすべて、本資料の計算式および前提条件に基づく推定です。実効果は業態・既存業務・人員構成により変動します。
      </Text>

      <Footer pageLabel={`5 / ${ROI_PAGE_TOTAL}`} />
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
    <Page size="A4" style={styles.page}>
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

      <Footer pageLabel={`6 / ${ROI_PAGE_TOTAL}`} />
    </Page>
  );
}

function RoiClosing() {
  return (
    <Page size="A4" style={styles.page}>
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

      <Footer pageLabel={`${ROI_PAGE_TOTAL} / ${ROI_PAGE_TOTAL}`} />
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
      {RoiFormula()}
      {RoiWorksheet()}
      {RoiLossModel()}
      {RoiReferenceTable()}
      {RoiSensitivity()}
      {RoiClosing()}
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
};
