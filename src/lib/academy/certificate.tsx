import React from "react";
import { Document, Page, Text, View, StyleSheet, Font } from "@react-pdf/renderer";
import { renderToBuffer } from "@react-pdf/renderer";

const NOTO_SANS_JP = "https://cdn.jsdelivr.net/fontsource/fonts/noto-sans-jp@latest/japanese-400-normal.ttf";
const NOTO_SANS_JP_BOLD = "https://cdn.jsdelivr.net/fontsource/fonts/noto-sans-jp@latest/japanese-700-normal.ttf";

Font.register({
  family: "NotoSansJP",
  fonts: [
    { src: NOTO_SANS_JP, fontWeight: 400 },
    { src: NOTO_SANS_JP_BOLD, fontWeight: 700 },
  ],
});

export const CATEGORY_LABEL: Record<string, string> = {
  general: "全般",
  ppf: "PPF 施工",
  coating: "コーティング",
  body_repair: "ボディリペア",
  maintenance: "メンテナンス",
};

export const CERTIFICATE_THRESHOLD = 10;

export interface AcademyCertificateData {
  category: string;
  tenant_name: string;
  lesson_count: number;
  issue_date: string;
  cert_number: string;
}

const styles = StyleSheet.create({
  page: {
    fontFamily: "NotoSansJP",
    backgroundColor: "#ffffff",
    padding: 0,
  },
  outer: {
    margin: 28,
    border: "2pt solid #1a1a2e",
    borderRadius: 4,
    flex: 1,
    padding: 40,
    flexDirection: "column",
    justifyContent: "space-between",
  },
  innerBorder: {
    position: "absolute",
    top: 8,
    left: 8,
    right: 8,
    bottom: 8,
    border: "0.5pt solid #c0a060",
    borderRadius: 2,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 32,
  },
  brand: {
    fontSize: 13,
    fontWeight: 700,
    color: "#1a1a2e",
    letterSpacing: 1,
  },
  brandSub: {
    fontSize: 8,
    color: "#666",
    marginTop: 2,
    letterSpacing: 0.5,
  },
  issueDate: {
    fontSize: 9,
    color: "#666",
    textAlign: "right",
  },
  titleBlock: {
    alignItems: "center",
    marginBottom: 36,
  },
  titleJa: {
    fontSize: 28,
    fontWeight: 700,
    color: "#1a1a2e",
    letterSpacing: 4,
    marginBottom: 6,
  },
  titleEn: {
    fontSize: 10,
    color: "#888",
    letterSpacing: 2,
  },
  categoryBadge: {
    marginTop: 14,
    backgroundColor: "#f5f0e8",
    borderRadius: 20,
    paddingHorizontal: 24,
    paddingVertical: 6,
    border: "0.5pt solid #c0a060",
  },
  categoryText: {
    fontSize: 14,
    fontWeight: 700,
    color: "#7a5c00",
    letterSpacing: 1,
  },
  body: {
    alignItems: "center",
    marginBottom: 36,
  },
  bodyText: {
    fontSize: 12,
    color: "#333",
    lineHeight: 2,
    textAlign: "center",
    letterSpacing: 0.5,
  },
  recipientName: {
    fontSize: 20,
    fontWeight: 700,
    color: "#1a1a2e",
    letterSpacing: 2,
    marginVertical: 6,
    borderBottom: "1pt solid #1a1a2e",
    paddingBottom: 4,
    minWidth: 200,
    textAlign: "center",
  },
  statsRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 32,
    marginTop: 16,
  },
  statBlock: {
    alignItems: "center",
  },
  statValue: {
    fontSize: 24,
    fontWeight: 700,
    color: "#1a1a2e",
  },
  statLabel: {
    fontSize: 8,
    color: "#888",
    marginTop: 2,
    letterSpacing: 0.5,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    borderTop: "0.5pt solid #ddd",
    paddingTop: 16,
  },
  certNumber: {
    fontSize: 8,
    color: "#aaa",
    letterSpacing: 0.5,
  },
  issuer: {
    alignItems: "flex-end",
  },
  issuerName: {
    fontSize: 11,
    fontWeight: 700,
    color: "#1a1a2e",
    letterSpacing: 1,
  },
  issuerSub: {
    fontSize: 8,
    color: "#888",
    marginTop: 2,
  },
});

function AcademyCertificateDocument({ data }: { data: AcademyCertificateData }) {
  const categoryLabel = CATEGORY_LABEL[data.category] ?? data.category;
  const [y, m, d] = data.issue_date.split("-");
  const issueDateJa = `${y}年${m}月${d}日`;

  return (
    <Document>
      <Page size="A4" orientation="landscape" style={styles.page}>
        <View style={styles.outer}>
          <View style={styles.innerBorder} />

          {/* ヘッダー */}
          <View style={styles.header}>
            <View>
              <Text style={styles.brand}>Ledra Academy</Text>
              <Text style={styles.brandSub}>施工技術オンライン学習プラットフォーム</Text>
            </View>
            <Text style={styles.issueDate}>発行日: {issueDateJa}</Text>
          </View>

          {/* タイトル */}
          <View style={styles.titleBlock}>
            <Text style={styles.titleJa}>修　了　証</Text>
            <Text style={styles.titleEn}>CERTIFICATE OF COMPLETION</Text>
            <View style={styles.categoryBadge}>
              <Text style={styles.categoryText}>{categoryLabel} コース</Text>
            </View>
          </View>

          {/* 本文 */}
          <View style={styles.body}>
            <Text style={styles.bodyText}>下記の者は</Text>
            <Text style={styles.recipientName}>{data.tenant_name}</Text>
            <Text style={styles.bodyText}>
              Ledra Academy における {categoryLabel} コースの{"\n"}
              所定レッスンをすべて修了したことを、ここに証明します。
            </Text>
            <View style={styles.statsRow}>
              <View style={styles.statBlock}>
                <Text style={styles.statValue}>{data.lesson_count}</Text>
                <Text style={styles.statLabel}>LESSONS COMPLETED</Text>
              </View>
              <View style={styles.statBlock}>
                <Text style={styles.statValue}>{categoryLabel}</Text>
                <Text style={styles.statLabel}>COURSE</Text>
              </View>
            </View>
          </View>

          {/* フッター */}
          <View style={styles.footer}>
            <Text style={styles.certNumber}>認定番号: {data.cert_number}</Text>
            <View style={styles.issuer}>
              <Text style={styles.issuerName}>Ledra, Inc.</Text>
              <Text style={styles.issuerSub}>記録を、業界の共通言語にする。</Text>
            </View>
          </View>
        </View>
      </Page>
    </Document>
  );
}

export async function renderAcademyCertificate(data: AcademyCertificateData): Promise<Buffer> {
  return renderToBuffer(<AcademyCertificateDocument data={data} />);
}
