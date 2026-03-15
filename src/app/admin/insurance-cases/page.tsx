import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/format";
import { CaseStatusBadge } from "@/components/StatusBadge";

export const dynamic = "force-dynamic";

const CASE_TYPE_LABELS: Record<string, string> = {
  accident: "事故入庫",
  vehicle_insurance: "車両保険",
  rework_check: "再施工確認",
  damage_check: "損傷確認",
  other: "その他",
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(v: string | string[] | undefined): string {
  return Array.isArray(v) ? String(v[0] ?? "") : String(v ?? "");
}

export default async function AdminInsuranceCasesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const status = first(sp.status).trim();
  const caseType = first(sp.case_type).trim();

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/admin/insurance-cases");

  const { data: membership } = await supabase
    .from("tenant_memberships")
    .select("tenant_id")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (!membership?.tenant_id) {
    return (
      <main className="p-6">
        <p className="text-sm text-neutral-600">tenant_memberships が見つかりません。</p>
      </main>
    );
  }

  let query = supabase
    .from("insurance_cases")
    .select("*, tenants:tenants!inner(name), vehicles:vehicles!inner(maker, model, plate_display), insurers:insurers!inner(name)")
    .eq("tenant_id", membership.tenant_id)
    .order("updated_at", { ascending: false })
    .limit(200);

  if (status) query = query.eq("status", status);
  if (caseType) query = query.eq("case_type", caseType);

  const { data: cases, error } = await query;

  if (error) {
    return (
      <main className="p-6">
        <p className="text-sm text-red-700">データ読み込みエラー: {error.message}</p>
      </main>
    );
  }

  const rows = (cases ?? []).map((r: any) => ({
    id: r.id,
    case_number: r.case_number,
    title: r.title,
    case_type: r.case_type,
    status: r.status,
    insurer_name: r.insurers?.name ?? "",
    vehicle_summary: [r.vehicles?.maker, r.vehicles?.model, r.vehicles?.plate_display]
      .filter(Boolean)
      .join(" "),
    submitted_at: r.submitted_at,
    updated_at: r.updated_at,
  }));

  return (
    <main className="min-h-screen bg-neutral-50 p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-3">
            <div className="inline-flex rounded-full border border-neutral-300 bg-white px-3 py-1 text-[11px] font-semibold tracking-[0.22em] text-neutral-600">
              INSURANCE CASES
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-neutral-900">
                保険案件管理
              </h1>
              <p className="mt-2 text-sm text-neutral-600">
                保険会社との案件対応を管理
              </p>
            </div>
          </div>
          <Link
            href="/admin/insurance-cases/new"
            className="btn-primary px-5 py-2.5 text-sm"
          >
            新規案件を起票
          </Link>
        </header>

        {/* Filters */}
        <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
          <form action="/admin/insurance-cases" method="get" className="flex flex-wrap gap-3">
            <select
              name="status"
              defaultValue={status}
              className="rounded-xl border border-neutral-300 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400"
            >
              <option value="">全ステータス</option>
              <option value="draft">下書き</option>
              <option value="submitted">提出済み</option>
              <option value="under_review">確認中</option>
              <option value="info_requested">情報依頼</option>
              <option value="approved">承認</option>
              <option value="rejected">却下</option>
              <option value="closed">完了</option>
              <option value="cancelled">キャンセル</option>
            </select>
            <select
              name="case_type"
              defaultValue={caseType}
              className="rounded-xl border border-neutral-300 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400"
            >
              <option value="">全種別</option>
              <option value="accident">事故入庫</option>
              <option value="vehicle_insurance">車両保険</option>
              <option value="rework_check">再施工確認</option>
              <option value="damage_check">損傷確認</option>
              <option value="other">その他</option>
            </select>
            <button type="submit" className="btn-primary px-4 py-2.5">
              絞り込み
            </button>
          </form>
        </section>

        {/* Table */}
        <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div className="text-xs font-semibold tracking-[0.18em] text-neutral-500">
              {rows.length > 0 ? `${rows.length} 件` : "案件なし"}
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-neutral-200">
            <table className="min-w-full text-sm">
              <thead className="bg-neutral-50">
                <tr>
                  <th className="p-3 text-left font-semibold text-neutral-600">案件番号</th>
                  <th className="p-3 text-left font-semibold text-neutral-600">タイトル</th>
                  <th className="p-3 text-left font-semibold text-neutral-600">種別</th>
                  <th className="p-3 text-left font-semibold text-neutral-600">保険会社</th>
                  <th className="p-3 text-left font-semibold text-neutral-600">車両</th>
                  <th className="p-3 text-left font-semibold text-neutral-600">ステータス</th>
                  <th className="p-3 text-left font-semibold text-neutral-600">更新日</th>
                  <th className="p-3 text-left font-semibold text-neutral-600">操作</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-t hover:bg-neutral-50">
                    <td className="p-3 font-mono text-xs text-neutral-700">{row.case_number}</td>
                    <td className="p-3 font-medium text-neutral-900">{row.title}</td>
                    <td className="p-3 text-neutral-600">{CASE_TYPE_LABELS[row.case_type] ?? row.case_type}</td>
                    <td className="p-3 text-neutral-600">{row.insurer_name}</td>
                    <td className="p-3 text-neutral-600">{row.vehicle_summary || "-"}</td>
                    <td className="p-3">
                      <CaseStatusBadge status={row.status} />
                    </td>
                    <td className="p-3 whitespace-nowrap text-neutral-600">
                      {formatDateTime(row.updated_at)}
                    </td>
                    <td className="p-3">
                      <Link
                        href={`/admin/insurance-cases/${row.id}`}
                        className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-100"
                      >
                        詳細
                      </Link>
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-sm text-neutral-500">
                      案件がありません。
                      <Link href="/admin/insurance-cases/new" className="ml-2 text-blue-600 hover:underline">
                        新規案件を起票
                      </Link>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
