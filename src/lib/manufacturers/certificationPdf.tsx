import React from "react";
import { Document, Page, Text, View, Image, StyleSheet, Font } from "@react-pdf/renderer";
import { renderToBuffer } from "@react-pdf/renderer";
import { notoSansJpDataUrl } from "@/lib/marketing/pdfFonts";

// バンドル済み Noto Sans JP (public/fonts) を data URL として登録する。
// 外部 CDN (@latest) への実行時フェッチを排し、供給元の改変・停止リスクを断つ。
Font.register({
  family: "NotoSansJP",
  fonts: [
    { src: notoSansJpDataUrl(400), fontWeight: 400 },
    { src: notoSansJpDataUrl(700), fontWeight: 700 },
  ],
});

export type CertificationCertInput = {
  manufacturerName: string;
  manufacturerLogoUrl: string | null;
  tenantName: string;
  certifiedAt: string; // ISO
  /** Reference number printed at the bottom for traceability. */
  certificationId: string;
};

const colors = {
  ink: "#1a1a2e",
  sub: "#444a5e",
  faint: "#8a90a2",
  accent: "#7c3aed",
  border: "#d9dbe4",
  bg: "#ffffff",
} as const;

const styles = StyleSheet.create({
  page: {
    backgroundColor: colors.bg,
    fontFamily: "NotoSansJP",
    paddingVertical: 64,
    paddingHorizontal: 56,
    color: colors.ink,
  },
  outerBorder: {
    flex: 1,
    borderWidth: 2,
    borderColor: colors.accent,
    borderRadius: 6,
    padding: 4,
  },
  innerBorder: {
    flex: 1,
    borderWidth: 0.75,
    borderColor: colors.border,
    borderRadius: 4,
    paddingVertical: 48,
    paddingHorizontal: 44,
    alignItems: "center",
  },
  logo: {
    height: 40,
    maxWidth: 200,
    objectFit: "contain",
    marginBottom: 16,
  },
  eyebrow: {
    fontSize: 9,
    letterSpacing: 6,
    color: colors.faint,
    textTransform: "uppercase",
    marginBottom: 18,
  },
  title: {
    fontSize: 30,
    fontWeight: 700,
    letterSpacing: 2,
    marginBottom: 6,
  },
  titleRule: {
    width: 70,
    height: 3,
    backgroundColor: colors.accent,
    marginTop: 10,
    marginBottom: 34,
  },
  leadIn: {
    fontSize: 11,
    color: colors.sub,
    marginBottom: 14,
  },
  tenantName: {
    fontSize: 24,
    fontWeight: 700,
    marginBottom: 14,
    textAlign: "center",
  },
  body: {
    fontSize: 11,
    lineHeight: 1.9,
    color: colors.sub,
    textAlign: "center",
    maxWidth: 420,
    marginBottom: 36,
  },
  manufacturerName: {
    fontSize: 14,
    fontWeight: 700,
    color: colors.ink,
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: "100%",
    marginTop: 28,
    paddingTop: 16,
    borderTopWidth: 0.75,
    borderTopColor: colors.border,
  },
  metaLabel: {
    fontSize: 7.5,
    letterSpacing: 2,
    color: colors.faint,
    textTransform: "uppercase",
    marginBottom: 3,
  },
  metaValue: {
    fontSize: 10,
    color: colors.ink,
    fontWeight: 700,
  },
  footerNote: {
    position: "absolute",
    bottom: 30,
    left: 56,
    right: 56,
    fontSize: 7,
    color: colors.faint,
    textAlign: "center",
  },
});

function formatJaDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  // サーバTZ (UTC) ではなく JST で日付を確定させる (日付が1日ずれるのを防ぐ)。
  return d.toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric", timeZone: "Asia/Tokyo" });
}

/**
 * Renders a formal "認定施工店証" PDF declaring that a contractor is
 * an authorized installer of the manufacturer. Intentionally
 * self-contained (no QR / blockchain) — this certifies the business
 * relationship, not an individual job.
 */
export async function renderCertificationCertificatePdf(input: CertificationCertInput): Promise<Buffer> {
  const doc = (
    <Document>
      <Page size="A4" orientation="landscape" style={styles.page}>
        <View style={styles.outerBorder}>
          <View style={styles.innerBorder}>
            {input.manufacturerLogoUrl ? (
              // @react-pdf/renderer Image is not a DOM img; alt-text rule N/A.
              // eslint-disable-next-line jsx-a11y/alt-text
              <Image src={input.manufacturerLogoUrl} style={styles.logo} />
            ) : null}

            <Text style={styles.eyebrow}>CERTIFICATE OF AUTHORIZED INSTALLER</Text>
            <Text style={styles.title}>認定施工店証</Text>
            <View style={styles.titleRule} />

            <Text style={styles.leadIn}>下記の事業者を当社の認定施工店として認定します</Text>
            <Text style={styles.tenantName}>{input.tenantName}</Text>

            <Text style={styles.body}>
              本証は、上記事業者が <Text style={styles.manufacturerName}>{input.manufacturerName}</Text>{" "}
              の定める基準を満たし、当社の指定するデザインで施工証明書を発行できる
              認定施工店であることを証明するものです。
            </Text>

            <View style={styles.metaRow}>
              <View>
                <Text style={styles.metaLabel}>認定企業</Text>
                <Text style={styles.metaValue}>{input.manufacturerName}</Text>
              </View>
              <View style={{ alignItems: "center" }}>
                <Text style={styles.metaLabel}>認定日</Text>
                <Text style={styles.metaValue}>{formatJaDate(input.certifiedAt)}</Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={styles.metaLabel}>認定番号</Text>
                <Text style={styles.metaValue}>{input.certificationId.slice(0, 8).toUpperCase()}</Text>
              </View>
            </View>
          </View>
        </View>
        <Text style={styles.footerNote}>
          この認定証は Ledra プラットフォーム上の認定記録に基づいて発行されています。 認定の有効性は{" "}
          {input.manufacturerName} のメーカーポータルで確認できます。
        </Text>
      </Page>
    </Document>
  );

  return await renderToBuffer(doc);
}
