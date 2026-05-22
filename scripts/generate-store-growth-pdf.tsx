/**
 * 3年収支計画 — 加盟店舗数試算レポートを PDF で書き出すスクリプト。
 *
 *   npx tsx scripts/generate-store-growth-pdf.tsx [出力先]
 *
 * 既定の出力先: /tmp/ledra-pdfs/store-growth-projection-3y.pdf
 *
 * 元データ:
 *   docs/internal/store-growth-projection-3y.md
 */

import React from "react";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { Document, Page, Text, View, StyleSheet, Font, renderToBuffer } from "@react-pdf/renderer";
import { notoSansJpDataUrl } from "@/lib/marketing/pdfFonts";

const colors = {
  bg: "#060a12",
  bgAlt: "#0b111c",
  text: "#ffffff",
  mute: "#8e99b0",
  mute2: "#5f6a81",
  accent: "#60a5fa",
  accent2: "#a78bfa",
  green: "#34d399",
  red: "#f87171",
  border: "#1a2233",
  rowAlt: "#0f1623",
};

const s = StyleSheet.create({
  page: {
    fontFamily: "NotoSansJP",
    backgroundColor: colors.bg,
    color: colors.text,
    padding: 36,
    paddingBottom: 56,
  },
  pageHeader: { fontSize: 8, color: colors.mute2, marginBottom: 4, letterSpacing: 2 },
  gradientBar: { height: 2, backgroundColor: colors.accent, marginBottom: 14 },
  h1: { fontSize: 22, fontWeight: 700, lineHeight: 1.25, marginBottom: 10 },
  h2: { fontSize: 13, fontWeight: 700, marginTop: 12, marginBottom: 6 },
  h3: { fontSize: 10.5, fontWeight: 700, marginTop: 8, marginBottom: 4, color: colors.accent2 },
  lead: { fontSize: 10, color: colors.mute, lineHeight: 1.6, marginBottom: 10 },
  body: { fontSize: 9.5, color: "#c8cfdd", lineHeight: 1.65, marginBottom: 4 },
  bodyMute: { fontSize: 8.5, color: colors.mute, lineHeight: 1.55, marginBottom: 6 },

  // tables
  tableHead: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: colors.accent,
    paddingBottom: 4,
    marginTop: 4,
    backgroundColor: colors.bgAlt,
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border,
    paddingVertical: 3.5,
  },
  tableRowAlt: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border,
    paddingVertical: 3.5,
    backgroundColor: colors.rowAlt,
  },
  tableTotal: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: colors.accent,
    paddingVertical: 5,
    marginTop: 2,
    backgroundColor: colors.bgAlt,
  },
  th: { fontSize: 8, fontWeight: 700, color: colors.mute, paddingHorizontal: 3 },
  td: { fontSize: 8.5, color: "#c8cfdd", paddingHorizontal: 3 },
  tdBold: { fontSize: 8.5, fontWeight: 700, color: colors.text, paddingHorizontal: 3 },
  tdRight: { fontSize: 8.5, color: "#c8cfdd", paddingHorizontal: 3, textAlign: "right" },
  tdRightBold: { fontSize: 8.5, fontWeight: 700, color: colors.text, paddingHorizontal: 3, textAlign: "right" },

  // KPI cards
  kpiRow: { flexDirection: "row", gap: 8, marginBottom: 10, marginTop: 4 },
  kpi: {
    flex: 1,
    border: `1pt solid ${colors.border}`,
    borderRadius: 4,
    padding: 8,
    backgroundColor: colors.bgAlt,
  },
  kpiLabel: { fontSize: 8, color: colors.mute2, marginBottom: 3 },
  kpiValue: { fontSize: 15, fontWeight: 700, color: colors.text },
  kpiSub: { fontSize: 8, color: colors.mute, marginTop: 2 },

  // callout
  callout: {
    border: `1pt solid ${colors.accent}`,
    backgroundColor: colors.bgAlt,
    borderRadius: 4,
    padding: 10,
    marginVertical: 8,
  },
  calloutTitle: { fontSize: 9, fontWeight: 700, color: colors.accent, marginBottom: 3 },
  calloutBody: { fontSize: 9.5, color: "#c8cfdd", lineHeight: 1.5 },

  footer: {
    position: "absolute",
    bottom: 22,
    left: 36,
    right: 36,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 7,
    color: colors.mute2,
  },

  // cover
  coverPage: {
    fontFamily: "NotoSansJP",
    backgroundColor: colors.bg,
    color: colors.text,
    padding: 48,
    justifyContent: "center",
  },
  coverTag: { fontSize: 9, color: colors.accent, letterSpacing: 3, marginBottom: 18 },
  coverTitle: { fontSize: 32, fontWeight: 700, lineHeight: 1.2, marginBottom: 12 },
  coverSub: { fontSize: 13, color: colors.mute, lineHeight: 1.6, marginBottom: 30 },
  coverMeta: { fontSize: 9.5, color: colors.mute2, lineHeight: 1.7 },
  coverGrad: { height: 3, backgroundColor: colors.accent, width: 80, marginBottom: 24 },
});

// === Format helpers =========================================================
const yen = (n: number) => `¥${n.toLocaleString("ja-JP")}`;
const yenK = (n: number) => `¥${(n / 1000).toLocaleString("ja-JP", { maximumFractionDigits: 0 })}k`;
const pct = (n: number) => `${n.toFixed(2)}%`;

// === Data ===================================================================

const Y1_MONTHS = [
  { m: "4月", rev: 312000, cogs: 18720, fixed: 350000, profit: -56720, stores: 13, newStores: 13 },
  { m: "5月", rev: 496000, cogs: 29760, fixed: 400000, profit: 66240, stores: 21, newStores: 8 },
  { m: "6月", rev: 702000, cogs: 42120, fixed: 550000, profit: 109880, stores: 29, newStores: 8 },
  { m: "7月", rev: 930000, cogs: 55800, fixed: 750000, profit: 124200, stores: 39, newStores: 10 },
  { m: "8月", rev: 1180000, cogs: 70800, fixed: 950000, profit: 159200, stores: 49, newStores: 10 },
  { m: "9月", rev: 1400000, cogs: 84000, fixed: 1050000, profit: 266000, stores: 58, newStores: 9 },
  { m: "10月", rev: 1620000, cogs: 97200, fixed: 1300000, profit: 222800, stores: 68, newStores: 10 },
  { m: "11月", rev: 1788000, cogs: 107280, fixed: 1450000, profit: 230720, stores: 75, newStores: 7 },
  { m: "12月", rev: 1934000, cogs: 116040, fixed: 1600000, profit: 217960, stores: 81, newStores: 6 },
  { m: "1月", rev: 2110000, cogs: 126600, fixed: 1750000, profit: 233400, stores: 88, newStores: 7 },
  { m: "2月", rev: 2286000, cogs: 137160, fixed: 1900000, profit: 248840, stores: 95, newStores: 7 },
  { m: "3月", rev: 2410000, cogs: 144600, fixed: 1950000, profit: 315400, stores: 100, newStores: 5 },
];

const Y2_QUARTERS = [
  { q: "Q1", rev: 9900000, monthAvg: 3300000, avgStores: 138, endStores: 148, newQ: 48 },
  { q: "Q2", rev: 12150000, monthAvg: 4050000, avgStores: 169, endStores: 179, newQ: 31 },
  { q: "Q3", rev: 14400000, monthAvg: 4800000, avgStores: 200, endStores: 210, newQ: 31 },
  { q: "Q4", rev: 16650000, monthAvg: 5550000, avgStores: 231, endStores: 242, newQ: 32 },
];

const Y3_QUARTERS = [
  { q: "Q1", rev: 20100000, monthAvg: 6700000, avgStores: 279, endStores: 295, newQ: 53 },
  { q: "Q2", rev: 23475000, monthAvg: 7825000, avgStores: 326, endStores: 342, newQ: 47 },
  { q: "Q3", rev: 26850000, monthAvg: 8950000, avgStores: 373, endStores: 388, newQ: 46 },
  { q: "Q4", rev: 30225000, monthAvg: 10075000, avgStores: 420, endStores: 435, newQ: 47 },
];

const COGS_PER_STORE = [
  { name: "Stripe 決済手数料", use: "サブスク課金処理 (3.6%)", perStore: 864, revPct: 3.6, cogsPct: 60.0 },
  { name: "Supabase (Pro)", use: "DB / Auth / Storage / Realtime", perStore: 216, revPct: 0.9, cogsPct: 15.0 },
  { name: "Anthropic API", use: "車検証 OCR (Haiku)", perStore: 144, revPct: 0.6, cogsPct: 10.0 },
  { name: "Vercel", use: "ホスティング・帯域・関数実行", perStore: 72, revPct: 0.3, cogsPct: 5.0 },
  { name: "Upstash", use: "Redis (RL) + QStash (非同期)", perStore: 36, revPct: 0.15, cogsPct: 2.5 },
  { name: "Resend", use: "メール配信 (証明書/OTP/通知)", perStore: 30, revPct: 0.125, cogsPct: 2.1 },
  { name: "Polygon", use: "アンカリング gas (POL)", perStore: 30, revPct: 0.125, cogsPct: 2.1 },
  { name: "Twilio", use: "SMS / OTP", perStore: 24, revPct: 0.1, cogsPct: 1.7 },
  { name: "Sentry", use: "エラー監視", perStore: 24, revPct: 0.1, cogsPct: 1.7 },
];

const COGS_3Y_BY_SERVICE = [
  { name: "Stripe 決済手数料", y1: 618048, y2: 1911600, y3: 3623400, total: 6153048 },
  { name: "Supabase", y1: 154512, y2: 477900, y3: 905850, total: 1538262 },
  { name: "Anthropic API", y1: 103008, y2: 318600, y3: 603900, total: 1025508 },
  { name: "Vercel", y1: 51504, y2: 159300, y3: 301950, total: 512754 },
  { name: "Upstash", y1: 25752, y2: 79650, y3: 150975, total: 256377 },
  { name: "Resend", y1: 21460, y2: 66375, y3: 125813, total: 213648 },
  { name: "Polygon gas", y1: 21460, y2: 66375, y3: 125813, total: 213648 },
  { name: "Twilio", y1: 17168, y2: 53100, y3: 100650, total: 170918 },
  { name: "Sentry", y1: 17168, y2: 53100, y3: 100650, total: 170918 },
];

// === Common building blocks =================================================

function PageFooter({ pageNo, total }: { pageNo: number; total: number }) {
  return (
    <View style={s.footer} fixed>
      <Text>Ledra · 3年収支計画 加盟店舗数試算</Text>
      <Text>{`${pageNo} / ${total}`}</Text>
    </View>
  );
}

function PageHeader({ tag }: { tag: string }) {
  return (
    <>
      <Text style={s.pageHeader}>{tag}</Text>
      <View style={s.gradientBar} />
    </>
  );
}

// === Pages ==================================================================

function CoverPage() {
  return (
    <Page size="A4" style={s.coverPage}>
      <Text style={s.coverTag}>INTERNAL · 経営計画資料</Text>
      <View style={s.coverGrad} />
      <Text style={s.coverTitle}>3年収支計画{"\n"}加盟店舗数 試算</Text>
      <Text style={s.coverSub}>
        ARPU ¥24,000 / 店舗・月 を前提に、3年分の収支表 (売上・原価・固定費・利益) から
        加盟店舗の月次・四半期増加数を逆算。{"\n"}
        売上原価 6.0% の内訳を Ledra 実スタック (Stripe/Supabase/Anthropic 等) で分解。
      </Text>
      <Text style={s.coverMeta}>作成日: 2026-05-21</Text>
      <Text style={s.coverMeta}>対象: 1年目 (月次) / 2-3年目 (四半期)</Text>
      <Text style={s.coverMeta}>関連: docs/ledra-goals-strategy-2026-05.md</Text>
    </Page>
  );
}

function SummaryPage() {
  return (
    <Page size="A4" style={s.page}>
      <PageHeader tag="01 · エグゼクティブサマリ" />
      <Text style={s.h1}>3年累計サマリ</Text>
      <Text style={s.lead}>
        ARPU ¥24,000 / 店舗・月 を前提に逆算した加盟店舗数の推移。
        毎年 35〜40% のペースで新規獲得が加速する成長カーブ。
      </Text>

      <View style={s.kpiRow}>
        <View style={s.kpi}>
          <Text style={s.kpiLabel}>1年目末 店舗数</Text>
          <Text style={s.kpiValue}>100</Text>
          <Text style={s.kpiSub}>純増 +100 (月平均 8.3)</Text>
        </View>
        <View style={s.kpi}>
          <Text style={s.kpiLabel}>2年目末 店舗数</Text>
          <Text style={s.kpiValue}>242</Text>
          <Text style={s.kpiSub}>純増 +142 (月平均 11.8)</Text>
        </View>
        <View style={s.kpi}>
          <Text style={s.kpiLabel}>3年目末 店舗数</Text>
          <Text style={s.kpiValue}>435</Text>
          <Text style={s.kpiSub}>純増 +193 (月平均 16.1)</Text>
        </View>
      </View>

      <View style={s.kpiRow}>
        <View style={s.kpi}>
          <Text style={s.kpiLabel}>1年目 年商</Text>
          <Text style={s.kpiValue}>¥17.2M</Text>
          <Text style={s.kpiSub}>利益 ¥2.1M</Text>
        </View>
        <View style={s.kpi}>
          <Text style={s.kpiLabel}>2年目 年商</Text>
          <Text style={s.kpiValue}>¥53.1M</Text>
          <Text style={s.kpiSub}>利益 ¥5.5M</Text>
        </View>
        <View style={s.kpi}>
          <Text style={s.kpiLabel}>3年目 年商</Text>
          <Text style={s.kpiValue}>¥100.7M</Text>
          <Text style={s.kpiSub}>利益 ¥22.0M</Text>
        </View>
      </View>

      <Text style={s.h2}>主な前提</Text>
      <Text style={s.body}>· ARPU = ¥24,000 / 店舗・月 (Standard プラン ¥24,800 ベースの丸め値)</Text>
      <Text style={s.body}>· 売上原価率 = 6.00% (実数値、全期間一定)</Text>
      <Text style={s.body}>· 売上はすべて店舗サブスク (＋アドオン) 由来。保険会社 ARR・流通 ARR は含まない</Text>
      <Text style={s.body}>· 解約率ゼロ / キャンペーン値引きゼロ</Text>
      <Text style={s.body}>· 期末店舗数 = 当該期間最終月の売上 ÷ ARPU</Text>

      <View style={s.callout}>
        <Text style={s.calloutTitle}>主要な気づき</Text>
        <Text style={s.calloutBody}>
          3年目末 435 店舗 / ARR run-rate ¥1.25 億 は、戦略ドキュメントの
          ARR 10億目標 (¥24k換算で 3,472 店) の 12.5%。残りは 4年目以降の獲得加速、
          ARPU 引き上げ、保険/OEM 階層の積み上げで埋める設計。
        </Text>
      </View>

      <PageFooter pageNo={2} total={6} />
    </Page>
  );
}

function InputDataPage() {
  return (
    <Page size="A4" style={s.page}>
      <PageHeader tag="02 · 入力データ (収支表)" />
      <Text style={s.h1}>3年収支計画 — 元データ</Text>

      <Text style={s.h2}>1年目 (月次)</Text>
      <View style={s.tableHead}>
        <Text style={[s.th, { flex: 1 }]}>月</Text>
        <Text style={[s.th, { flex: 1.6, textAlign: "right" }]}>売上高</Text>
        <Text style={[s.th, { flex: 1.4, textAlign: "right" }]}>売上原価</Text>
        <Text style={[s.th, { flex: 1.4, textAlign: "right" }]}>固定費</Text>
        <Text style={[s.th, { flex: 1.4, textAlign: "right" }]}>利益</Text>
      </View>
      {Y1_MONTHS.map((row, i) => (
        <View key={row.m} style={i % 2 === 0 ? s.tableRow : s.tableRowAlt}>
          <Text style={[s.td, { flex: 1 }]}>{row.m}</Text>
          <Text style={[s.tdRight, { flex: 1.6 }]}>{yen(row.rev)}</Text>
          <Text style={[s.tdRight, { flex: 1.4 }]}>{yen(row.cogs)}</Text>
          <Text style={[s.tdRight, { flex: 1.4 }]}>{yen(row.fixed)}</Text>
          <Text style={[s.tdRight, { flex: 1.4, color: row.profit < 0 ? colors.red : colors.green }]}>
            {row.profit < 0 ? "-" : ""}{yen(Math.abs(row.profit))}
          </Text>
        </View>
      ))}
      <View style={s.tableTotal}>
        <Text style={[s.tdBold, { flex: 1 }]}>年計</Text>
        <Text style={[s.tdRightBold, { flex: 1.6 }]}>¥17,168,000</Text>
        <Text style={[s.tdRightBold, { flex: 1.4 }]}>¥1,030,080</Text>
        <Text style={[s.tdRightBold, { flex: 1.4 }]}>¥14,000,000</Text>
        <Text style={[s.tdRightBold, { flex: 1.4, color: colors.green }]}>¥2,137,920</Text>
      </View>

      <View style={{ flexDirection: "row", gap: 12, marginTop: 14 }}>
        <View style={{ flex: 1 }}>
          <Text style={s.h2}>2年目 (四半期)</Text>
          <View style={s.tableHead}>
            <Text style={[s.th, { flex: 1 }]}>Q</Text>
            <Text style={[s.th, { flex: 2, textAlign: "right" }]}>売上高</Text>
            <Text style={[s.th, { flex: 2, textAlign: "right" }]}>月次平均</Text>
          </View>
          {Y2_QUARTERS.map((row, i) => (
            <View key={row.q} style={i % 2 === 0 ? s.tableRow : s.tableRowAlt}>
              <Text style={[s.td, { flex: 1 }]}>{row.q}</Text>
              <Text style={[s.tdRight, { flex: 2 }]}>{yen(row.rev)}</Text>
              <Text style={[s.tdRight, { flex: 2 }]}>{yen(row.monthAvg)}</Text>
            </View>
          ))}
          <View style={s.tableTotal}>
            <Text style={[s.tdBold, { flex: 1 }]}>年計</Text>
            <Text style={[s.tdRightBold, { flex: 2 }]}>¥53,100,000</Text>
            <Text style={[s.tdRightBold, { flex: 2 }]}>—</Text>
          </View>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.h2}>3年目 (四半期)</Text>
          <View style={s.tableHead}>
            <Text style={[s.th, { flex: 1 }]}>Q</Text>
            <Text style={[s.th, { flex: 2, textAlign: "right" }]}>売上高</Text>
            <Text style={[s.th, { flex: 2, textAlign: "right" }]}>月次平均</Text>
          </View>
          {Y3_QUARTERS.map((row, i) => (
            <View key={row.q} style={i % 2 === 0 ? s.tableRow : s.tableRowAlt}>
              <Text style={[s.td, { flex: 1 }]}>{row.q}</Text>
              <Text style={[s.tdRight, { flex: 2 }]}>{yen(row.rev)}</Text>
              <Text style={[s.tdRight, { flex: 2 }]}>{yen(row.monthAvg)}</Text>
            </View>
          ))}
          <View style={s.tableTotal}>
            <Text style={[s.tdBold, { flex: 1 }]}>年計</Text>
            <Text style={[s.tdRightBold, { flex: 2 }]}>¥100,650,000</Text>
            <Text style={[s.tdRightBold, { flex: 2 }]}>—</Text>
          </View>
        </View>
      </View>

      <PageFooter pageNo={3} total={6} />
    </Page>
  );
}

function StoreGrowthPage() {
  return (
    <Page size="A4" style={s.page}>
      <PageHeader tag="03 · 加盟店舗数 推移" />
      <Text style={s.h1}>店舗数の月次・四半期推移</Text>
      <Text style={s.lead}>売上 ÷ ARPU(¥24,000) で逆算した店舗数。</Text>

      <Text style={s.h2}>1年目 月次</Text>
      <View style={s.tableHead}>
        <Text style={[s.th, { flex: 1 }]}>月</Text>
        <Text style={[s.th, { flex: 1.6, textAlign: "right" }]}>売上</Text>
        <Text style={[s.th, { flex: 1.2, textAlign: "right" }]}>店舗数 (累計)</Text>
        <Text style={[s.th, { flex: 1.2, textAlign: "right" }]}>当月新規</Text>
      </View>
      {Y1_MONTHS.map((row, i) => (
        <View key={row.m} style={i % 2 === 0 ? s.tableRow : s.tableRowAlt}>
          <Text style={[s.td, { flex: 1 }]}>{row.m}</Text>
          <Text style={[s.tdRight, { flex: 1.6 }]}>{yen(row.rev)}</Text>
          <Text style={[i === 11 ? s.tdRightBold : s.tdRight, { flex: 1.2 }]}>{row.stores}</Text>
          <Text style={[s.tdRight, { flex: 1.2, color: colors.accent }]}>+{row.newStores}</Text>
        </View>
      ))}

      <View style={{ flexDirection: "row", gap: 12, marginTop: 12 }}>
        <View style={{ flex: 1 }}>
          <Text style={s.h2}>2年目 四半期</Text>
          <View style={s.tableHead}>
            <Text style={[s.th, { flex: 0.7 }]}>Q</Text>
            <Text style={[s.th, { flex: 1.2, textAlign: "right" }]}>平均店舗</Text>
            <Text style={[s.th, { flex: 1.2, textAlign: "right" }]}>期末店舗</Text>
            <Text style={[s.th, { flex: 1, textAlign: "right" }]}>新規</Text>
          </View>
          {Y2_QUARTERS.map((row, i) => (
            <View key={row.q} style={i % 2 === 0 ? s.tableRow : s.tableRowAlt}>
              <Text style={[s.td, { flex: 0.7 }]}>{row.q}</Text>
              <Text style={[s.tdRight, { flex: 1.2 }]}>{row.avgStores}</Text>
              <Text style={[i === 3 ? s.tdRightBold : s.tdRight, { flex: 1.2 }]}>{row.endStores}</Text>
              <Text style={[s.tdRight, { flex: 1, color: colors.accent }]}>+{row.newQ}</Text>
            </View>
          ))}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.h2}>3年目 四半期</Text>
          <View style={s.tableHead}>
            <Text style={[s.th, { flex: 0.7 }]}>Q</Text>
            <Text style={[s.th, { flex: 1.2, textAlign: "right" }]}>平均店舗</Text>
            <Text style={[s.th, { flex: 1.2, textAlign: "right" }]}>期末店舗</Text>
            <Text style={[s.th, { flex: 1, textAlign: "right" }]}>新規</Text>
          </View>
          {Y3_QUARTERS.map((row, i) => (
            <View key={row.q} style={i % 2 === 0 ? s.tableRow : s.tableRowAlt}>
              <Text style={[s.td, { flex: 0.7 }]}>{row.q}</Text>
              <Text style={[s.tdRight, { flex: 1.2 }]}>{row.avgStores}</Text>
              <Text style={[i === 3 ? s.tdRightBold : s.tdRight, { flex: 1.2 }]}>{row.endStores}</Text>
              <Text style={[s.tdRight, { flex: 1, color: colors.accent }]}>+{row.newQ}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={s.callout}>
        <Text style={s.calloutTitle}>獲得ペースの推移</Text>
        <Text style={s.calloutBody}>
          月次平均新規獲得は 1年目 8.3 → 2年目 11.8 → 3年目 16.1 と毎年加速。
          1年目は初動 (4月) で 13 店舗、後半は月 5〜7 店舗に落ち着く。2-3年目は
          四半期 +30〜50 店舗で安定。
        </Text>
      </View>

      <PageFooter pageNo={4} total={6} />
    </Page>
  );
}

function CogsBreakdownPage() {
  return (
    <Page size="A4" style={s.page}>
      <PageHeader tag="04 · 売上原価 (COGS) 内訳" />
      <Text style={s.h1}>売上原価 6.00% の構造</Text>
      <Text style={s.lead}>
        Ledra の実スタック (.env.example) に基づく、店舗あたり原価 ¥1,440/月 の内訳。
        Stripe 決済手数料 (3.6%) が全体の 60% を占める。
      </Text>

      <Text style={s.h2}>店舗あたり単価 (ARPU ¥24,000 / 月)</Text>
      <View style={s.tableHead}>
        <Text style={[s.th, { flex: 1.4 }]}>サービス</Text>
        <Text style={[s.th, { flex: 2.2 }]}>用途</Text>
        <Text style={[s.th, { flex: 1, textAlign: "right" }]}>¥/店・月</Text>
        <Text style={[s.th, { flex: 0.9, textAlign: "right" }]}>売上比</Text>
        <Text style={[s.th, { flex: 0.9, textAlign: "right" }]}>原価比</Text>
      </View>
      {COGS_PER_STORE.map((row, i) => (
        <View key={row.name} style={i % 2 === 0 ? s.tableRow : s.tableRowAlt}>
          <Text style={[s.td, { flex: 1.4 }]}>{row.name}</Text>
          <Text style={[s.td, { flex: 2.2 }]}>{row.use}</Text>
          <Text style={[s.tdRight, { flex: 1 }]}>{yen(row.perStore)}</Text>
          <Text style={[s.tdRight, { flex: 0.9 }]}>{pct(row.revPct)}</Text>
          <Text style={[s.tdRight, { flex: 0.9 }]}>{pct(row.cogsPct)}</Text>
        </View>
      ))}
      <View style={s.tableTotal}>
        <Text style={[s.tdBold, { flex: 1.4 }]}>合計</Text>
        <Text style={[s.td, { flex: 2.2 }]} />
        <Text style={[s.tdRightBold, { flex: 1 }]}>¥1,440</Text>
        <Text style={[s.tdRightBold, { flex: 0.9 }]}>6.00%</Text>
        <Text style={[s.tdRightBold, { flex: 0.9 }]}>100%</Text>
      </View>

      <Text style={s.h2}>サービス別 3年累計</Text>
      <View style={s.tableHead}>
        <Text style={[s.th, { flex: 1.6 }]}>サービス</Text>
        <Text style={[s.th, { flex: 1.4, textAlign: "right" }]}>1年目</Text>
        <Text style={[s.th, { flex: 1.4, textAlign: "right" }]}>2年目</Text>
        <Text style={[s.th, { flex: 1.4, textAlign: "right" }]}>3年目</Text>
        <Text style={[s.th, { flex: 1.6, textAlign: "right" }]}>3年累計</Text>
      </View>
      {COGS_3Y_BY_SERVICE.map((row, i) => (
        <View key={row.name} style={i % 2 === 0 ? s.tableRow : s.tableRowAlt}>
          <Text style={[s.td, { flex: 1.6 }]}>{row.name}</Text>
          <Text style={[s.tdRight, { flex: 1.4 }]}>{yen(row.y1)}</Text>
          <Text style={[s.tdRight, { flex: 1.4 }]}>{yen(row.y2)}</Text>
          <Text style={[s.tdRight, { flex: 1.4 }]}>{yen(row.y3)}</Text>
          <Text style={[s.tdRightBold, { flex: 1.6 }]}>{yen(row.total)}</Text>
        </View>
      ))}
      <View style={s.tableTotal}>
        <Text style={[s.tdBold, { flex: 1.6 }]}>合計</Text>
        <Text style={[s.tdRightBold, { flex: 1.4 }]}>¥1,030,080</Text>
        <Text style={[s.tdRightBold, { flex: 1.4 }]}>¥3,186,000</Text>
        <Text style={[s.tdRightBold, { flex: 1.4 }]}>¥6,039,000</Text>
        <Text style={[s.tdRightBold, { flex: 1.6 }]}>¥10,255,080</Text>
      </View>

      <View style={s.callout}>
        <Text style={s.calloutTitle}>原価の感応度</Text>
        <Text style={s.calloutBody}>
          Stripe 60% の比重が高い。保険会社・OEM 階層の課金が始まれば Stripe 比率は
          下がる (BtoB 契約は銀行振込中心)。Anthropic 比率は AI 機能拡張で 10% → 15%+ に
          伸びる可能性。Polygon は Mainnet 切替・発行頻度の高い大型店で上振れ余地。
        </Text>
      </View>

      <PageFooter pageNo={5} total={6} />
    </Page>
  );
}

function ConclusionPage() {
  return (
    <Page size="A4" style={s.page}>
      <PageHeader tag="05 · 結論と次の手" />
      <Text style={s.h1}>ARR 10億目標との位置付け</Text>
      <Text style={s.lead}>
        戦略ドキュメント (`docs/ledra-goals-strategy-2026-05.md`) の ARR 10億目標を
        本試算 (ARPU ¥24,000) で読み替え、達成率を確認する。
      </Text>

      <View style={s.tableHead}>
        <Text style={[s.th, { flex: 2.4 }]}>指標</Text>
        <Text style={[s.th, { flex: 1.4, textAlign: "right" }]}>¥35k 基準</Text>
        <Text style={[s.th, { flex: 1.4, textAlign: "right" }]}>¥24k 換算</Text>
        <Text style={[s.th, { flex: 1.4, textAlign: "right" }]}>3年目末</Text>
        <Text style={[s.th, { flex: 1.2, textAlign: "right" }]}>達成率</Text>
      </View>
      <View style={s.tableRow}>
        <Text style={[s.td, { flex: 2.4 }]}>店舗 ARR ¥6 億 (店舗サブスク分)</Text>
        <Text style={[s.tdRight, { flex: 1.4 }]}>1,400 店</Text>
        <Text style={[s.tdRight, { flex: 1.4 }]}>2,083 店</Text>
        <Text style={[s.tdRightBold, { flex: 1.4 }]}>435 店</Text>
        <Text style={[s.tdRight, { flex: 1.2, color: colors.accent }]}>20.9%</Text>
      </View>
      <View style={s.tableRowAlt}>
        <Text style={[s.td, { flex: 2.4 }]}>ARR 10 億 (全カテゴリ)</Text>
        <Text style={[s.tdRight, { flex: 1.4 }]}>2,400 店</Text>
        <Text style={[s.tdRight, { flex: 1.4 }]}>3,472 店</Text>
        <Text style={[s.tdRightBold, { flex: 1.4 }]}>435 店</Text>
        <Text style={[s.tdRight, { flex: 1.2, color: colors.accent }]}>12.5%</Text>
      </View>
      <View style={s.tableRow}>
        <Text style={[s.td, { flex: 2.4 }]}>ARR run-rate (Y3 3月 × 12)</Text>
        <Text style={[s.tdRight, { flex: 1.4 }]}>—</Text>
        <Text style={[s.tdRight, { flex: 1.4 }]}>—</Text>
        <Text style={[s.tdRightBold, { flex: 1.4 }]}>¥1.25 億</Text>
        <Text style={[s.tdRight, { flex: 1.2 }]}>—</Text>
      </View>

      <Text style={s.h2}>ARR 10億達成に向けた 4つの選択肢</Text>
      <Text style={s.body}>
        <Text style={{ fontWeight: 700, color: colors.accent2 }}>1. 店舗獲得加速</Text> —
        4年目以降に月 50〜80 店ペース (3年目の 3〜5 倍)。営業/CS 増員と、
        代理店経由の獲得チャネル拡大が前提。
      </Text>
      <Text style={s.body}>
        <Text style={{ fontWeight: 700, color: colors.accent2 }}>2. ARPU 引き上げ</Text> —
        Standard → Pro (¥49,800) 比率向上、ブランド証明書プレミアム (¥4,400/月) の
        標準化で実効 ARPU を ¥35,000+ へ。Pro 比率 30% で目標達成。
      </Text>
      <Text style={s.body}>
        <Text style={{ fontWeight: 700, color: colors.accent2 }}>3. 保険会社 ARR</Text> —
        Lighthouse (損保ジャパン本命) 1社 ¥500〜1,000万/月の本番運用。3社で ¥3億 ARR
        相当。戦略ドキュメントの最優先施策。
      </Text>
      <Text style={s.body}>
        <Text style={{ fontWeight: 700, color: colors.accent2 }}>4. 流通 / OEM ARR</Text> —
        中古車査定連携・OEM API の従量課金。トヨタ Woven City PoC 経由で ¥1億 ARR
        相当。
      </Text>

      <Text style={s.h2}>結論</Text>
      <Text style={s.body}>
        · ARPU ¥24,000 / 売上原価 6% / 解約ゼロ前提で、3年目末は 435 店舗
      </Text>
      <Text style={s.body}>
        · 年間純増 +100 / +142 / +193 と毎年 35〜40% 加速するペース
      </Text>
      <Text style={s.body}>
        · 店舗 SaaS 単独では ARR 10億に届かず、保険/OEM 階層の並走が必須
      </Text>
      <Text style={s.body}>
        · 売上原価は Stripe 60% / Supabase 15% / Anthropic 10% / その他 15% で構成
      </Text>

      <PageFooter pageNo={6} total={6} />
    </Page>
  );
}

// === Document ===============================================================

function StoreGrowthDocument() {
  return (
    <Document
      title="3年収支計画 — 加盟店舗数試算"
      author="Ledra"
      subject="ARPU ¥24,000 ベースの店舗増加数と売上原価内訳"
      creator="Ledra"
      producer="Ledra"
    >
      <CoverPage />
      <SummaryPage />
      <InputDataPage />
      <StoreGrowthPage />
      <CogsBreakdownPage />
      <ConclusionPage />
    </Document>
  );
}

// === Main ===================================================================

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

async function main() {
  ensureFonts();
  const outPath = resolve(
    process.argv[2] ?? "/tmp/ledra-pdfs/store-growth-projection-3y.pdf",
  );
  await mkdir(dirname(outPath), { recursive: true });

  console.log(`Generating PDF -> ${outPath}`);
  const t0 = Date.now();
  const buffer = await renderToBuffer(<StoreGrowthDocument />);
  await writeFile(outPath, buffer);
  const ms = Date.now() - t0;
  const kb = (buffer.length / 1024).toFixed(1);
  console.log(`Done: ${kb} KB in ${ms} ms`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
