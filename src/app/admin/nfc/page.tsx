import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

function tagStatusMeta(status?: string | null) {
  const s = String(status ?? "").toLowerCase();
  if (s === "attached") return { label: "貼付済", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" };
  if (s === "written")  return { label: "書込済", cls: "bg-sky-50 text-sky-700 border-sky-200" };
  if (s === "prepared") return { label: "未書込", cls: "bg-amber-50 text-amber-700 border-amber-200" };
  if (s === "lost")     return { label: "紛失",   cls: "bg-red-50 text-red-700 border-red-200" };
  if (s === "retired")  return { label: "廃止",   cls: "bg-red-50 text-red-700 border-red-200" };
  if (s === "error")    return { label: "エラー", cls: "bg-red-50 text-red-700 border-red-200" };
  return { label: status ?? "未設定", cls: "bg-neutral-50 text-neutral-600 border-neutral-200" };
}

function certStatusMeta(status?: string | null) {
  const s = String(status ?? "").toLowerCase();
  if (s === "active")   return { label: "有効",     cls: "bg-emerald-50 text-emerald-700 border-emerald-200" };
  if (s === "void")     return { label: "無効",     cls: "bg-red-50 text-red-700 border-red-200" };
  if (s === "draft")    return { label: "下書き",   cls: "bg-blue-50 text-blue-700 border-blue-200" };
  if (s === "expired")  return { label: "期限切れ", cls: "bg-amber-50 text-amber-700 border-amber-200" };
  return { label: status ?? "不明", cls: "bg-neutral-50 text-neutral-600 border-neutral-200" };
}

function vehicleLabel(v: { maker?: string | null; model?: string | null; year?: number | null; plate_display?: string | null } | null) {
  if (!v) return "-";
  const head = [v.maker, v.model].filter(Boolean).join(" ");
  const tail = [v.year ? `${v.year}年` : "", v.plate_display ?? ""].filter(Boolean).join(" / ");
  if (head && tail) return `${head} (${tail})`;
  return head || tail || "-";
}

export default async function AdminNfcPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/admin/nfc");

  const { data: membership } = await supabase
    .from("tenant_memberships")
    .select("tenant_id")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (!membership?.tenant_id) {
    return <main className="p-6 text-sm text-neutral-600">tenant が見つかりません。</main>;
  }
  const tenantId = membership.tenant_id as string;

  const { data: rows, error } = await supabase
    .from("nfc_tags")
    .select("id,tag_code,uid,vehicle_id,certificate_id,status,written_at,attached_at,created_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });

  if (error) {
    return <main className="p-6 text-sm text-red-700">エラー: {error.message}</main>;
  }

  const nfcRows = (rows ?? []) as Array<{
    id: string; tag_code: string | null; uid: string | null; vehicle_id: string | null;
    certificate_id: string | null; status: string | null; written_at: string | null;
    attached_at: string | null; created_at: string | null;
  }>;

  const vehicleIds = [...new Set(nfcRows.map((r) => r.vehicle_id).filter(Boolean))] as string[];
  const certIds = [...new Set(nfcRows.map((r) => r.certificate_id).filter(Boolean))] as string[];

  const vehicleMap = new Map<string, any>();
  const certMap = new Map<string, any>();

  if (vehicleIds.length > 0) {
    const { data: vs } = await supabase.from("vehicles")
      .select("id,maker,model,year,plate_display,customer_name").in("id", vehicleIds);
    for (const v of vs ?? []) vehicleMap.set(v.id, v);
  }
  if (certIds.length > 0) {
    const { data: cs } = await supabase.from("certificates")
      .select("id,public_id,status").in("id", certIds);
    for (const c of cs ?? []) certMap.set(c.id, c);
  }

  const total = nfcRows.length;
  const attached = nfcRows.filter((r) => r.status === "attached").length;
  const written  = nfcRows.filter((r) => r.status === "written").length;
  const prepared = nfcRows.filter((r) => r.status === "prepared").length;

  return (
    <main className="min-h-screen bg-neutral-50 p-6">
      <div className="mx-auto max-w-7xl space-y-6">

        {/* Header */}
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-3">
            <div className="inline-flex rounded-full border border-neutral-300 bg-white px-3 py-1 text-[11px] font-semibold tracking-[0.22em] text-neutral-600">
              NFC TAGS
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-neutral-900">NFCタグ管理</h1>
              <p className="mt-2 text-sm text-neutral-600">
                NFCタグの台帳・状態・証明書／車両との紐付けを確認します。
              </p>
            </div>
          </div>
          <Link
            href="/admin"
            className="rounded-xl border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
          >
            ダッシュボード
          </Link>
        </header>

        {/* Stats */}
        <section className="grid gap-4 sm:grid-cols-4">
          <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
            <div className="text-xs font-semibold tracking-[0.18em] text-neutral-500">TOTAL</div>
            <div className="mt-2 text-2xl font-bold text-neutral-900">{total}</div>
            <div className="mt-1 text-xs text-neutral-500">登録タグ数</div>
          </div>
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
            <div className="text-xs font-semibold tracking-[0.18em] text-emerald-600">ATTACHED</div>
            <div className="mt-2 text-2xl font-bold text-emerald-700">{attached}</div>
            <div className="mt-1 text-xs text-emerald-600">貼付済み</div>
          </div>
          <div className="rounded-2xl border border-sky-200 bg-sky-50 p-5 shadow-sm">
            <div className="text-xs font-semibold tracking-[0.18em] text-sky-600">WRITTEN</div>
            <div className="mt-2 text-2xl font-bold text-sky-700">{written}</div>
            <div className="mt-1 text-xs text-sky-600">書込済み</div>
          </div>
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
            <div className="text-xs font-semibold tracking-[0.18em] text-amber-600">PREPARED</div>
            <div className="mt-2 text-2xl font-bold text-amber-700">{prepared}</div>
            <div className="mt-1 text-xs text-amber-600">未書込み</div>
          </div>
        </section>

        {/* Table */}
        <section className="rounded-2xl border border-neutral-200 bg-white shadow-sm">
          <div className="p-5 border-b border-neutral-100">
            <div className="text-xs font-semibold tracking-[0.18em] text-neutral-500">TAG LIST</div>
            <div className="mt-1 text-base font-semibold text-neutral-900">タグ台帳</div>
          </div>

          {nfcRows.length === 0 ? (
            <div className="p-8 text-center text-sm text-neutral-500">
              NFCタグがまだ登録されていません。
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-neutral-100 bg-neutral-50">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-500">状態</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-500">タグコード</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-500">車両 / 顧客</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-500">証明書</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-500">UID</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-500">書込日時</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-500">貼付日時</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {nfcRows.map((row) => {
                    const v = row.vehicle_id ? vehicleMap.get(row.vehicle_id) ?? null : null;
                    const c = row.certificate_id ? certMap.get(row.certificate_id) ?? null : null;
                    const tagMeta = tagStatusMeta(row.status);
                    const cMeta = certStatusMeta(c?.status);
                    const publicId = c?.public_id?.trim() ?? "";

                    return (
                      <tr key={row.id} className="hover:bg-neutral-50 align-top">
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${tagMeta.cls}`}>
                            {tagMeta.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs">{row.tag_code ?? "-"}</td>
                        <td className="px-4 py-3">
                          {v ? (
                            <Link href={`/admin/vehicles/${row.vehicle_id}`} className="font-medium text-neutral-900 hover:underline">
                              {vehicleLabel(v)}
                            </Link>
                          ) : <span className="text-neutral-500">-</span>}
                          {v?.customer_name && (
                            <div className="mt-0.5 text-xs text-neutral-500">{v.customer_name}</div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {publicId ? (
                            <div className="space-y-1">
                              <Link href={`/c/${publicId}`} target="_blank" className="font-mono text-xs text-neutral-700 hover:underline">
                                {publicId}
                              </Link>
                              <div>
                                <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${cMeta.cls}`}>
                                  {cMeta.label}
                                </span>
                              </div>
                            </div>
                          ) : <span className="text-neutral-500">-</span>}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-neutral-500">{row.uid ?? "-"}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-xs text-neutral-500">{formatDateTime(row.written_at)}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-xs text-neutral-500">{formatDateTime(row.attached_at)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

      </div>
    </main>
  );
}
