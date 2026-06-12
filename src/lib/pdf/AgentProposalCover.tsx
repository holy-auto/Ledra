/**
 * Agent proposal cover sheet — generated server-side via @react-pdf/renderer.
 *
 * Rendered by `POST /api/agent/materials/[id]/personalize` and prepended (by
 * the agent, manually) to a shared material PDF when proposing to a customer.
 *
 * NOTE: all dynamic content here (material title, company / contact names,
 * memo, agent name) is Japanese. Helvetica cannot render CJK glyphs, so this
 * document registers and uses the bundled NotoSansJP subset — the same font
 * the marketing PDFs use. Falling back to a Latin-only family would produce
 * blank / tofu output.
 */

import React from "react";
import { Document, Page, Text, View, StyleSheet, Font } from "@react-pdf/renderer";
import { notoSansJpDataUrl } from "@/lib/marketing/pdfFonts";

export type CoverData = {
  materialTitle: string;
  companyName: string;
  contactName: string;
  proposalDate?: string;
  agentName: string;
  memo?: string;
};

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

const styles = StyleSheet.create({
  page: { padding: 60, fontFamily: "NotoSansJP", backgroundColor: "#ffffff" },
  header: { borderBottom: "2pt solid #1a1a2e", paddingBottom: 20, marginBottom: 40 },
  brand: { fontSize: 11, color: "#6b7280", letterSpacing: 3, textTransform: "uppercase" },
  title: { fontSize: 22, fontWeight: 700, color: "#1a1a2e", marginTop: 8 },
  section: { marginBottom: 28 },
  label: { fontSize: 9, color: "#9ca3af", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 4 },
  value: { fontSize: 14, color: "#111827" },
  contactValue: { fontSize: 12, color: "#374151", marginTop: 2 },
  memoValue: { fontSize: 12, color: "#374151", lineHeight: 1.6 },
  footer: { position: "absolute", bottom: 40, left: 60, right: 60, borderTop: "1pt solid #e5e7eb", paddingTop: 12 },
  footerText: { fontSize: 9, color: "#9ca3af" },
});

export function AgentProposalCover({ data }: { data: CoverData }) {
  ensureFonts();
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.brand}>LEDRA</Text>
          <Text style={styles.title}>{data.materialTitle}</Text>
        </View>
        <View style={styles.section}>
          <Text style={styles.label}>提出先</Text>
          <Text style={styles.value}>{data.companyName}</Text>
          {data.contactName ? <Text style={styles.contactValue}>{data.contactName} 様</Text> : null}
        </View>
        {data.proposalDate ? (
          <View style={styles.section}>
            <Text style={styles.label}>提案日</Text>
            <Text style={styles.value}>{data.proposalDate}</Text>
          </View>
        ) : null}
        {data.memo ? (
          <View style={styles.section}>
            <Text style={styles.label}>備考</Text>
            <Text style={styles.memoValue}>{data.memo}</Text>
          </View>
        ) : null}
        <View style={styles.footer}>
          <Text style={styles.footerText}>提出元：{data.agentName}</Text>
        </View>
      </Page>
    </Document>
  );
}
