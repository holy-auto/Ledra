import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
} from "@react-pdf/renderer";
import { renderToBuffer } from "@react-pdf/renderer";
import { notoSansJpDataUrl } from "@/lib/marketing/pdfFonts";
import { fmtDate } from "@/lib/pdf/format";

Font.register({
  family: "NotoSansJP",
  fonts: [
    { src: notoSansJpDataUrl(400), fontWeight: 400 },
    { src: notoSansJpDataUrl(700), fontWeight: 700 },
  ],
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FtReportProject = {
  id: string;
  name: string;
  status: string;
  product_name: string | null;
  budget: number | null;
  target_units: number | null;
  starts_at: string | null;
  ends_at: string | null;
};

export type FtReportTenantDetail = {
  tenant_id: string;
  tenant_name: string;
  jobs: number;
  completed: number;
  pass: number;
  fail: number;
  conditional_pass: number;
  avg_score: number | null;
  defects: number;
  evidence: number;
};

export type FtReportData = {
  project: FtReportProject;
  generated_at: string;
  jobs: { total: number; by_status: Record<string, number> };
  inspections: {
    total: number;
    pass: number;
    fail: number;
    conditional_pass: number;
    pending: number;
    avg_score: number | null;
  };
  defects: {
    total: number;
    by_severity: Record<string, number>;
    by_status: Record<string, number>;
  };
  evidence: { total: number; by_type: Record<string, number> };
  tenants_detail: FtReportTenantDetail[];
};

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

const STATUS_JA: Record<string, string> = {
  draft: "下書き",
  recruiting: "募集中",
  active: "実施中",
  completed: "完了",
  archived: "アーカイブ",
};
const JOB_JA: Record<string, string> = {
  assigned: "割当済",
  in_progress: "施工中",
  evidence_submitted: "証拠提出済",
  inspection: "検査中",
  completed: "完了",
  rejected: "差戻し",
};
const SEV_JA: Record<string, string> = {
  low: "軽微",
  medium: "中",
  high: "重大",
  critical: "致命的",
};
const DEF_JA: Record<string, string> = {
  open: "未対応",
  investigating: "調査中",
  resolved: "解決済",
  closed: "クローズ",
  wontfix: "対応不要",
};
const EVT_JA: Record<string, string> = {
  photo_before: "施工前写真",
  photo_during: "施工中写真",
  photo_after: "施工後写真",
  measurement: "計測データ",
  env_data: "環境データ",
  video: "動画",
  document: "書類",
  other: "その他",
};

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const C = {
  primary: "#1a1a2e",
  accent: "#6c5ce7",
  accentLight: "#a29bfe",
  muted: "#636e72",
  border: "#dfe6e9",
  bg: "#f8f9fa",
  green: "#00b894",
  yellow: "#fdcb6e",
  red: "#d63031",
  white: "#ffffff",
};

const s = StyleSheet.create({
  page: { padding: 36, fontSize: 9, fontFamily: "NotoSansJP", color: C.primary },

  // Cover / Header
  coverBar: {
    backgroundColor: C.accent,
    height: 6,
    marginBottom: 20,
    borderRadius: 3,
  },
  title: { fontSize: 20, fontWeight: 700, marginBottom: 4 },
  subtitle: { fontSize: 11, color: C.muted, marginBottom: 16 },
  metaRow: { flexDirection: "row", gap: 20, marginBottom: 20 },
  metaItem: {},
  metaLabel: { fontSize: 7, color: C.muted, fontWeight: 700, marginBottom: 2 },
  metaValue: { fontSize: 10 },

  // KPI Cards
  kpiRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 20,
  },
  kpiCard: {
    flex: 1,
    backgroundColor: C.bg,
    borderRadius: 6,
    padding: 10,
    borderWidth: 0.5,
    borderColor: C.border,
  },
  kpiLabel: { fontSize: 7, color: C.muted, fontWeight: 700, marginBottom: 4 },
  kpiValue: { fontSize: 18, fontWeight: 700 },
  kpiUnit: { fontSize: 8, color: C.muted },

  // Section
  section: { marginBottom: 16 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: 700,
    marginBottom: 8,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: C.accent,
  },

  // Table
  table: { borderWidth: 0.5, borderColor: C.border, borderRadius: 4 },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: C.primary,
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
  },
  th: {
    fontSize: 7,
    fontWeight: 700,
    color: C.white,
    paddingVertical: 5,
    paddingHorizontal: 6,
  },
  tableRow: {
    flexDirection: "row",
    borderTopWidth: 0.5,
    borderTopColor: C.border,
  },
  tableRowAlt: { backgroundColor: C.bg },
  td: { fontSize: 8, paddingVertical: 4, paddingHorizontal: 6 },
  tdRight: { textAlign: "right" },

  // Breakdown rows
  breakdownRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 3,
    borderBottomWidth: 0.5,
    borderBottomColor: C.border,
  },
  breakdownLabel: { fontSize: 8, color: C.muted },
  breakdownValue: { fontSize: 8, fontWeight: 700 },

  // Bar
  barContainer: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 },
  barLabel: { width: 70, fontSize: 7, color: C.muted },
  barTrack: { flex: 1, height: 8, backgroundColor: C.border, borderRadius: 4 },
  barFill: { height: 8, backgroundColor: C.accentLight, borderRadius: 4 },
  barCount: { width: 24, fontSize: 7, textAlign: "right", fontWeight: 700 },

  // Footer
  footer: {
    position: "absolute",
    bottom: 20,
    left: 36,
    right: 36,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 7,
    color: C.muted,
  },
});

// ---------------------------------------------------------------------------
// Helper components
// ---------------------------------------------------------------------------

function KpiCard({
  label,
  value,
  unit,
}: {
  label: string;
  value: string | number;
  unit?: string;
}) {
  return (
    <View style={s.kpiCard}>
      <Text style={s.kpiLabel}>{label}</Text>
      <Text style={s.kpiValue}>
        {typeof value === "number" ? value.toLocaleString("ja-JP") : value}
        {unit ? <Text style={s.kpiUnit}> {unit}</Text> : null}
      </Text>
    </View>
  );
}

function BarRow({
  label,
  count,
  total,
}: {
  label: string;
  count: number;
  total: number;
}) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <View style={s.barContainer}>
      <Text style={s.barLabel}>{label}</Text>
      <View style={s.barTrack}>
        <View style={[s.barFill, { width: `${Math.min(pct, 100)}%` }]} />
      </View>
      <Text style={s.barCount}>{count}</Text>
    </View>
  );
}

function BreakdownSection({
  title,
  data,
  labels,
  total,
}: {
  title: string;
  data: Record<string, number>;
  labels: Record<string, string>;
  total: number;
}) {
  const entries = Object.entries(data).sort(([, a], [, b]) => b - a);
  if (entries.length === 0) return null;
  return (
    <View style={s.section}>
      <Text style={s.sectionTitle}>{title}</Text>
      {entries.map(([key, count]) => (
        <BarRow key={key} label={labels[key] ?? key} count={count} total={total} />
      ))}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Document
// ---------------------------------------------------------------------------

function FtReportDocument({ data }: { data: FtReportData }) {
  const { project: p, jobs, inspections: ins, defects: def, evidence: ev, tenants_detail } = data;

  const completionRate =
    jobs.total > 0
      ? Math.round(((jobs.by_status["completed"] ?? 0) / jobs.total) * 100)
      : 0;
  const passRate =
    ins.total > 0
      ? Math.round(((ins.pass + ins.conditional_pass) / ins.total) * 100)
      : 0;

  return (
    <Document>
      {/* ── Page 1: Cover + KPI + Tenant Table ── */}
      <Page size="A4" style={s.page}>
        <View style={s.coverBar} />
        <Text style={s.title}>{p.name}</Text>
        <Text style={s.subtitle}>
          Field Test Report — {STATUS_JA[p.status] ?? p.status}
        </Text>

        <View style={s.metaRow}>
          {p.product_name && (
            <View style={s.metaItem}>
              <Text style={s.metaLabel}>対象製品</Text>
              <Text style={s.metaValue}>{p.product_name}</Text>
            </View>
          )}
          <View style={s.metaItem}>
            <Text style={s.metaLabel}>実施期間</Text>
            <Text style={s.metaValue}>
              {fmtDate(p.starts_at)} ~ {fmtDate(p.ends_at)}
            </Text>
          </View>
          {p.budget != null && (
            <View style={s.metaItem}>
              <Text style={s.metaLabel}>予算</Text>
              <Text style={s.metaValue}>
                {Number(p.budget).toLocaleString("ja-JP")} 円
              </Text>
            </View>
          )}
          {p.target_units != null && (
            <View style={s.metaItem}>
              <Text style={s.metaLabel}>目標台数</Text>
              <Text style={s.metaValue}>{p.target_units} 台</Text>
            </View>
          )}
        </View>

        {/* KPI cards */}
        <View style={s.kpiRow}>
          <KpiCard label="総案件数" value={jobs.total} />
          <KpiCard label="完了率" value={`${completionRate}`} unit="%" />
          <KpiCard label="合格率" value={`${passRate}`} unit="%" />
          <KpiCard
            label="平均スコア"
            value={ins.avg_score != null ? ins.avg_score.toFixed(1) : "-"}
            unit="点"
          />
          <KpiCard label="不具合" value={def.total} unit="件" />
        </View>

        {/* Per-tenant table */}
        {tenants_detail.length > 0 && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>施工店別パフォーマンス</Text>
            <View style={s.table}>
              <View style={s.tableHeader}>
                <Text style={[s.th, { width: "25%" }]}>施工店</Text>
                <Text style={[s.th, { width: "10%", textAlign: "right" }]}>案件</Text>
                <Text style={[s.th, { width: "10%", textAlign: "right" }]}>完了</Text>
                <Text style={[s.th, { width: "12%", textAlign: "right" }]}>合格率</Text>
                <Text style={[s.th, { width: "13%", textAlign: "right" }]}>平均点</Text>
                <Text style={[s.th, { width: "10%", textAlign: "right" }]}>不具合</Text>
                <Text style={[s.th, { width: "10%", textAlign: "right" }]}>証拠</Text>
                <Text style={[s.th, { width: "10%", textAlign: "right" }]}>完了率</Text>
              </View>
              {tenants_detail.map((t, i) => {
                const inspTotal = t.pass + t.fail + t.conditional_pass;
                const tPassRate =
                  inspTotal > 0
                    ? Math.round(((t.pass + t.conditional_pass) / inspTotal) * 100)
                    : 0;
                const tCompRate =
                  t.jobs > 0 ? Math.round((t.completed / t.jobs) * 100) : 0;
                return (
                  <View
                    key={t.tenant_id}
                    style={[s.tableRow, i % 2 === 1 ? s.tableRowAlt : {}]}
                  >
                    <Text style={[s.td, { width: "25%" }]}>{t.tenant_name}</Text>
                    <Text style={[s.td, s.tdRight, { width: "10%" }]}>{t.jobs}</Text>
                    <Text style={[s.td, s.tdRight, { width: "10%" }]}>{t.completed}</Text>
                    <Text style={[s.td, s.tdRight, { width: "12%" }]}>{tPassRate}%</Text>
                    <Text style={[s.td, s.tdRight, { width: "13%" }]}>
                      {t.avg_score != null ? t.avg_score.toFixed(1) : "-"}
                    </Text>
                    <Text style={[s.td, s.tdRight, { width: "10%" }]}>{t.defects}</Text>
                    <Text style={[s.td, s.tdRight, { width: "10%" }]}>{t.evidence}</Text>
                    <Text style={[s.td, s.tdRight, { width: "10%" }]}>{tCompRate}%</Text>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        <View style={s.footer}>
          <Text>Ledra Field Test Report</Text>
          <Text>出力: {fmtDate(data.generated_at)}</Text>
        </View>
      </Page>

      {/* ── Page 2: Detailed Breakdown ── */}
      <Page size="A4" style={s.page}>
        <View style={s.coverBar} />
        <Text style={[s.sectionTitle, { marginBottom: 16 }]}>
          詳細分析 — {p.name}
        </Text>

        <View style={{ flexDirection: "row", gap: 16 }}>
          {/* Left column */}
          <View style={{ flex: 1 }}>
            <BreakdownSection
              title="案件ステータス"
              data={jobs.by_status}
              labels={JOB_JA}
              total={jobs.total}
            />
            <BreakdownSection
              title="不具合 — 重大度別"
              data={def.by_severity}
              labels={SEV_JA}
              total={def.total}
            />
          </View>

          {/* Right column */}
          <View style={{ flex: 1 }}>
            {/* Inspection summary */}
            <View style={s.section}>
              <Text style={s.sectionTitle}>品質検査結果</Text>
              <View style={s.breakdownRow}>
                <Text style={s.breakdownLabel}>合格</Text>
                <Text style={[s.breakdownValue, { color: C.green }]}>{ins.pass}</Text>
              </View>
              <View style={s.breakdownRow}>
                <Text style={s.breakdownLabel}>条件付合格</Text>
                <Text style={[s.breakdownValue, { color: C.yellow }]}>
                  {ins.conditional_pass}
                </Text>
              </View>
              <View style={s.breakdownRow}>
                <Text style={s.breakdownLabel}>不合格</Text>
                <Text style={[s.breakdownValue, { color: C.red }]}>{ins.fail}</Text>
              </View>
              <View style={s.breakdownRow}>
                <Text style={s.breakdownLabel}>未検査</Text>
                <Text style={s.breakdownValue}>{ins.pending}</Text>
              </View>
              {ins.avg_score != null && (
                <View style={[s.breakdownRow, { borderBottomWidth: 0, marginTop: 4 }]}>
                  <Text style={s.breakdownLabel}>平均スコア</Text>
                  <Text style={[s.breakdownValue, { fontSize: 12 }]}>
                    {ins.avg_score.toFixed(1)} 点
                  </Text>
                </View>
              )}
            </View>

            <BreakdownSection
              title="不具合 — ステータス別"
              data={def.by_status}
              labels={DEF_JA}
              total={def.total}
            />
          </View>
        </View>

        {/* Evidence breakdown */}
        <BreakdownSection
          title="証拠データ — 種別"
          data={ev.by_type}
          labels={EVT_JA}
          total={ev.total}
        />

        <View style={s.footer}>
          <Text>Ledra Field Test Report</Text>
          <Text>出力: {fmtDate(data.generated_at)}</Text>
        </View>
      </Page>
    </Document>
  );
}

// ---------------------------------------------------------------------------
// Public render function
// ---------------------------------------------------------------------------

export async function renderFieldTestReport(data: FtReportData): Promise<Buffer> {
  return renderToBuffer(<FtReportDocument data={data} />);
}
