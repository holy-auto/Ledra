import { redirect } from "next/navigation";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import PageHeader from "@/components/ui/PageHeader";
import { formatDateTime } from "@/lib/format";
import FindingActions from "./FindingActions";

/**
 * 部品装着インテグリティ 監査ダッシュボード（抜き取り監査・L7）。
 *
 * AI/ルールが自動検知した矛盾・改ざん疑い(part_integrity_findings)を重大度順に一覧する。
 * 設計: docs/parts-installation-integrity-design.md §4 L7
 */

export const dynamic = "force-dynamic";

type Severity = "critical" | "warning" | "info";
type StatusFilter = "open" | "resolved" | "all";

const RULE_LABEL: Record<string, string> = {
  serial_reused: "シリアル使い回し",
  photo_duplicate: "写真の使い回し",
  qty_mismatch: "数量不一致",
  three_way_mismatch: "三方照合不一致",
  context_mismatch: "文脈不一致",
  deepfake: "ディープフェイク疑い",
  photo_edited: "写真加工の疑い",
  timestamp_anomaly: "撮影時刻の異常",
};

const SEVERITY_STYLE: Record<Severity, string> = {
  critical: "bg-red-100 text-red-700",
  warning: "bg-amber-100 text-amber-700",
  info: "bg-gray-100 text-gray-600",
};

const SEVERITY_RANK: Record<Severity, number> = { critical: 0, warning: 1, info: 2 };

type FindingRow = {
  id: string;
  installation_id: string | null;
  rule: string;
  severity: Severity;
  detail: Record<string, unknown> | null;
  status: string;
  created_at: string;
};

function parseStatus(raw: string | string[] | undefined): StatusFilter {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return v === "resolved" || v === "all" ? v : "open";
}

function detailNote(detail: Record<string, unknown> | null): string {
  if (!detail) return "";
  if (typeof detail.note === "string") return detail.note;
  const hits = detail.hits;
  if (Array.isArray(hits) && hits.length > 0) return `${hits.length} 件の該当`;
  return "";
}

export default async function PartsIntegrityDashboard({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = (await searchParams) ?? {};
  const status = parseStatus(sp.status);

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/admin/parts-integrity");

  const { data: membership } = await supabase
    .from("tenant_memberships")
    .select("tenant_id")
    .eq("user_id", user.id)
    .limit(1)
    .single();
  if (!membership?.tenant_id) {
    return <div className="p-6 text-primary">tenant が見つかりません。</div>;
  }

  let query = supabase
    .from("part_integrity_findings")
    .select("id, installation_id, rule, severity, detail, status, created_at")
    .order("created_at", { ascending: false })
    .limit(300);
  if (status !== "all") query = query.eq("status", status);

  const { data } = await query.returns<FindingRow[]>();
  const findings = (data ?? []).sort(
    (a, b) =>
      (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9) || (a.created_at < b.created_at ? 1 : -1),
  );

  const openSummary = { critical: 0, warning: 0, info: 0 };
  if (status === "open") {
    for (const f of findings) if (f.severity in openSummary) openSummary[f.severity]++;
  }

  const tabs: { key: StatusFilter; label: string }[] = [
    { key: "open", label: "未対応" },
    { key: "resolved", label: "対応済み" },
    { key: "all", label: "すべて" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        tag="部品インテグリティ"
        title="装着監査ダッシュボード"
        description="AIとルールが自動検知した、部品交換の矛盾・改ざん疑いの一覧です。重大度の高い順に表示します。"
        tabs={tabs.map((tab) => ({
          key: tab.key,
          label: tab.label,
          href: `/admin/parts-integrity?status=${tab.key}`,
        }))}
        activeTab={status}
      />

      {status === "open" && (
        <div className="flex gap-3">
          {(["critical", "warning", "info"] as Severity[]).map((s) => (
            <div key={s} className={`rounded-lg px-4 py-3 ${SEVERITY_STYLE[s]}`}>
              <div className="text-2xl font-bold">{openSummary[s]}</div>
              <div className="text-xs">{s === "critical" ? "重大" : s === "warning" ? "警告" : "情報"}</div>
            </div>
          ))}
        </div>
      )}

      {findings.length === 0 ? (
        <p className="rounded-lg border border-border-default bg-surface-muted p-8 text-center text-secondary">
          該当する検知はありません。
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border-default">
          <table className="min-w-full divide-y divide-border-default text-sm">
            <thead className="bg-surface-muted text-left text-secondary">
              <tr>
                <th className="px-4 py-2">重大度</th>
                <th className="px-4 py-2">検知</th>
                <th className="px-4 py-2">内容</th>
                <th className="px-4 py-2">状態</th>
                <th className="px-4 py-2">検知日時</th>
                <th className="px-4 py-2">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-default">
              {findings.map((f) => (
                <tr key={f.id} className="text-primary">
                  <td className="px-4 py-2">
                    <span className={`rounded px-2 py-0.5 text-xs font-medium ${SEVERITY_STYLE[f.severity]}`}>
                      {f.severity === "critical" ? "重大" : f.severity === "warning" ? "警告" : "情報"}
                    </span>
                  </td>
                  <td className="px-4 py-2 font-medium">
                    {f.installation_id ? (
                      <a href={`/admin/parts-integrity/${f.installation_id}`} className="text-blue-700 hover:underline">
                        {RULE_LABEL[f.rule] ?? f.rule}
                      </a>
                    ) : (
                      (RULE_LABEL[f.rule] ?? f.rule)
                    )}
                  </td>
                  <td className="px-4 py-2 text-secondary">{detailNote(f.detail)}</td>
                  <td className="px-4 py-2 text-secondary">{f.status}</td>
                  <td className="px-4 py-2 text-secondary">{formatDateTime(f.created_at)}</td>
                  <td className="px-4 py-2">
                    <FindingActions id={f.id} status={f.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
