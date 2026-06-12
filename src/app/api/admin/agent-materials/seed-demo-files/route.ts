import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import { createPlatformScopedAdmin } from "@/lib/supabase/admin";
import { apiUnauthorized, apiForbidden, apiInternalError } from "@/lib/api/response";
import { renderToBuffer } from "@react-pdf/renderer";
import { Document, Page, Text, View, StyleSheet, Font } from "@react-pdf/renderer";
import { notoSansJpDataUrl } from "@/lib/marketing/pdfFonts";
import React from "react";

const DEMO_MATERIALS: { id: string; title: string; path: string }[] = [
  {
    id: "10000000-0000-0000-0000-000000000001",
    title: "Ledra サービス紹介資料",
    path: "materials/demo/ledra_service_overview_v2.pdf",
  },
  {
    id: "10000000-0000-0000-0000-000000000002",
    title: "料金プラン・機能比較表",
    path: "materials/demo/ledra_pricing_2026.pdf",
  },
  {
    id: "10000000-0000-0000-0000-000000000003",
    title: "代理店基本契約書（テンプレート）",
    path: "materials/demo/agent_contract_template.pdf",
  },
  {
    id: "10000000-0000-0000-0000-000000000004",
    title: "サービス利用規約（お客様向け）",
    path: "materials/demo/ledra_tos_agent_2026.pdf",
  },
  {
    id: "10000000-0000-0000-0000-000000000005",
    title: "代理店ポータル 操作マニュアル",
    path: "materials/demo/agent_portal_manual_v1.pdf",
  },
  {
    id: "10000000-0000-0000-0000-000000000006",
    title: "顧客向け紹介パンフレット（A4 カラー印刷用）",
    path: "materials/demo/ledra_pamphlet_customer_a4.pdf",
  },
  {
    id: "10000000-0000-0000-0000-000000000008",
    title: "代理店研修テキスト ① Ledraの特徴と差別化",
    path: "materials/demo/training_01_overview.pdf",
  },
];

let fontsReady = false;
function ensureFonts() {
  if (fontsReady) return;
  Font.register({
    family: "NotoSansJP",
    fonts: [
      { src: notoSansJpDataUrl(400), fontWeight: 400 },
      { src: notoSansJpDataUrl(700), fontWeight: 700 },
    ],
  });
  fontsReady = true;
}

const styles = StyleSheet.create({
  page: { padding: 60, fontFamily: "NotoSansJP", backgroundColor: "#f9fafb" },
  badge: {
    alignSelf: "flex-start",
    backgroundColor: "#dbeafe",
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginBottom: 32,
  },
  badgeText: { fontSize: 9, color: "#1d4ed8", letterSpacing: 2 },
  title: { fontSize: 24, fontWeight: 700, color: "#111827", marginBottom: 24, lineHeight: 1.4 },
  body: { fontSize: 13, color: "#6b7280", lineHeight: 1.8 },
  footer: {
    position: "absolute",
    bottom: 40,
    left: 60,
    right: 60,
    borderTop: "1pt solid #e5e7eb",
    paddingTop: 10,
  },
  footerText: { fontSize: 9, color: "#9ca3af" },
});

function PlaceholderPdf({ title }: { title: string }) {
  ensureFonts();
  return React.createElement(
    Document,
    null,
    React.createElement(
      Page,
      { size: "A4", style: styles.page },
      React.createElement(
        View,
        { style: styles.badge },
        React.createElement(Text, { style: styles.badgeText }, "DEMO DOCUMENT"),
      ),
      React.createElement(Text, { style: styles.title }, title),
      React.createElement(
        Text,
        { style: styles.body },
        "この資料はデモ用のプレースホルダーです。\n\n実際の運用では管理画面の「新規アップロード」から本物のファイルをアップロードしてください。\n\nプレビュー・ダウンロード機能の動作確認用として配置しています。",
      ),
      React.createElement(
        View,
        { style: styles.footer },
        React.createElement(Text, { style: styles.footerText }, "Ledra — 代理店向け資料管理 デモデータ"),
      ),
    ),
  );
}

export async function POST() {
  try {
    const supabase = await createClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "admin")) return apiForbidden();

    const admin = createPlatformScopedAdmin("seed demo agent materials — admin triggered");
    const results: { path: string; ok: boolean; error?: string }[] = [];

    for (const m of DEMO_MATERIALS) {
      try {
        const buffer = await renderToBuffer(
          React.createElement(PlaceholderPdf, { title: m.title }) as unknown as React.ReactElement<{ title?: string }>,
        );

        const { error } = await admin.storage
          .from("agent-materials")
          .upload(m.path, buffer, { contentType: "application/pdf", upsert: true });

        results.push({ path: m.path, ok: !error, error: error?.message });
      } catch (e) {
        results.push({ path: m.path, ok: false, error: String(e) });
      }
    }

    const failed = results.filter((r) => !r.ok);
    return NextResponse.json({ results, ok: failed.length === 0 }, { status: failed.length === 0 ? 200 : 207 });
  } catch (e) {
    return apiInternalError(e, "admin/agent-materials/seed-demo-files POST");
  }
}
