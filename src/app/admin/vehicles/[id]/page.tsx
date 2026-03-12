import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

function fmt(v?: string | null) {
  if (!v) return "-";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleDateString("ja-JP");
}

function fmtDt(v?: string | null) {
  if (!v) return "-";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleString("ja-JP");
}

function InfoRow({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div className="rounded-xl bg-neutral-50 p-3">
      <div className="text-[11px] font-semibold tracking-wide text-neutral-400 uppercase">{label}</div>
      <div className="mt-0.5 text-sm font-medium text-neutral-900">{value ?? "-"}</div>
    </div>
  );
}

function StatusBadge({ status }: { status?: string | null }) {
  const s = String(status ?? "").toLowerCase();
  const cls =
    s === "active"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : s === "void"
      ? "bg-red-50 text-red-700 border-red-200"
      : "bg-neutral-100 text-neutral-600 border-neutral-200";
  const dot =
    s === "active" ? "bg-emerald-500" : s === "void" ? "bg-red-500" : "bg-neutral-400";

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${cls}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {status ?? "-"}
    </span>
  );
}

export default async function AdminVehicleDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;

  const savedFlag = Array.isArray(sp?.saved) ? sp?.saved[0] : sp?.saved;
  const voidedFlag = Array.isArray(sp?.voided) ? sp?.voided[0] : sp?.voided;
  const errFlag = Array.isArray(sp?.e) ? sp?.e[0] : sp?.e;

  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: membership } = await supabase
    .from("tenant_memberships")
    .select("tenant_id")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (!membership?.tenant_id) {
    return <main className="p-6 text-sm text-neutral-600">tenant が見つかりません。</main>;
  }

  // ── Server Action ──────────────────────────────────────────
  async function voidCertificate(formData: FormData) {
    "use server";

    const certId = String(formData.get("certificate_id") ?? "").trim();
    if (!certId) redirect(`/admin/vehicles/${id}?e=1`);

    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect("/login");

    const { data: membership } = await supabase
      .from("tenant_memberships")
      .select("tenant_id")
      .eq("user_id", user.id)
      .limit(1)
      .single();

    if (!membership?.tenant_id) redirect(`/admin/vehicles/${id}?e=1`);

    const existing = await supabase
      .from("certificates")
      .select("id, tenant_id, vehicle_id, public_id, status")
      .eq("tenant_id", membership.tenant_id)
      .eq("vehicle_id", id)
      .eq("id", certId)
      .limit(1)
      .maybeSingle();

    if (existing.error || !existing.data?.id) redirect(`/admin/vehicles/${id}?e=1`);
    if (String(existing.data.status ?? "").toLowerCase() === "void") {
      redirect(`/admin/vehicles/${id}?voided=1`);
    }

    const nowIso = new Date().toISOString();

    const updated = await supabase
      .from("certificates")
      .update({ status: "void", updated_at: nowIso })
      .eq("tenant_id", membership.tenant_id)
      .eq("vehicle_id", id)
      .eq("id", certId);

    if (updated.error) redirect(`/admin/vehicles/${id}?e=1`);

    await supabase.from("vehicle_histories").insert({
      tenant_id: membership.tenant_id,
      vehicle_id: id,
      type: "certificate_voided",
      title: "施工証明書を無効化",
      description: existing.data.public_id ? `Public ID: ${existing.data.public_id}` : null,
      performed_at: nowIso,
      certificate_id: certId,
    });

    redirect(`/admin/vehicles/${id}?voided=1`);
  }
  // ───────────────────────────────────────────────────────────

  const { data: vehicle, error: vehicleError } = await supabase
    .from("vehicles")
    .select("*")
    .eq("tenant_id", membership.tenant_id)
    .eq("id", id)
    .single();

  if (vehicleError || !vehicle) {
    return <main className="p-6 text-sm text-neutral-600">車両が見つかりません。</main>;
  }

  const { data: certs } = await supabase
    .from("certificates")
    .select("id, public_id, certificate_no, service_type, created_at, status")
    .eq("tenant_id", membership.tenant_id)
    .eq("vehicle_id", id)
    .order("created_at", { ascending: false });

  const { data: histories } = await supabase
    .from("vehicle_histories")
    .select("id, type, title, description, performed_at, certificate_id")
    .eq("tenant_id", membership.tenant_id)
    .eq("vehicle_id", id)
    .order("performed_at", { ascending: false });

  const { data: tags } = await supabase
    .from("nfc_tags")
    .select("id, tag_code, status, written_at, attached_at, certificate_id")
    .eq("tenant_id", membership.tenant_id)
    .eq("vehicle_id", id)
    .order("created_at", { ascending: false });

  const certRows = certs ?? [];
  const historyRows = histories ?? [];
  const tagRows = tags ?? [];
  const activeCertCount = certRows.filter(
    (c) => String(c.status ?? "").toLowerCase() === "active"
  ).length;

  return (
    <main className="min-h-screen bg-neutral-50 p-6">
      <div className="mx-auto max-w-7xl space-y-6">

        {/* Header */}
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-3">
            <div className="inline-flex rounded-full border border-neutral-300 bg-white px-3 py-1 text-[11px] font-semibold tracking-[0.22em] text-neutral-600">
              VEHICLE DETAIL
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-neutral-900">
                {[vehicle.maker, vehicle.model].filter(Boolean).join(" ") || "車両詳細"}
              </h1>
              <p className="mt-1 text-sm text-neutral-500">
                {vehicle.year ? `${vehicle.year}年式` : ""}{vehicle.year && vehicle.plate_display ? " · " : ""}{vehicle.plate_display ?? ""}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/admin/vehicles"
              className="rounded-xl border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
            >
              一覧へ
            </Link>
            <Link
              href={`/admin/vehicles/${vehicle.id}/edit`}
              className="rounded-xl border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
            >
              編集
            </Link>
            <Link
              href={`/admin/certificates/new?vehicle_id=${vehicle.id}`}
              className="rounded-xl border border-neutral-900 bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700"
            >
              + 証明書を作成
            </Link>
          </div>
        </header>

        {/* Banners */}
        {savedFlag ? (
          <div className="rounded-2xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-800">
            車両情報を保存しました。
          </div>
        ) : null}
        {voidedFlag ? (
          <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
            証明書を無効化しました。履歴保全のため「void」として記録しています。
          </div>
        ) : null}
        {errFlag ? (
          <div className="rounded-2xl border border-red-300 bg-red-50 p-4 text-sm text-red-700">
            処理に失敗しました。もう一度お試しください。
          </div>
        ) : null}

        {/* Stats */}
        <section className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
            <div className="text-xs font-semibold tracking-[0.18em] text-neutral-500">CERTIFICATES</div>
            <div className="mt-2 text-2xl font-bold text-neutral-900">{certRows.length}</div>
            <div className="mt-1 text-xs text-neutral-500">発行済み証明書</div>
          </div>
          <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
            <div className="text-xs font-semibold tracking-[0.18em] text-neutral-500">ACTIVE</div>
            <div className="mt-2 text-2xl font-bold text-emerald-700">{activeCertCount}</div>
            <div className="mt-1 text-xs text-neutral-500">有効な証明書</div>
          </div>
          <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
            <div className="text-xs font-semibold tracking-[0.18em] text-neutral-500">HISTORY</div>
            <div className="mt-2 text-2xl font-bold text-neutral-900">{historyRows.length}</div>
            <div className="mt-1 text-xs text-neutral-500">履歴件数</div>
          </div>
        </section>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-6">

            {/* 証明書一覧 */}
            <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold tracking-[0.18em] text-neutral-500">CERTIFICATES</div>
                  <div className="mt-1 text-lg font-semibold text-neutral-900">証明書履歴</div>
                </div>
                <Link
                  href={`/admin/certificates/new?vehicle_id=${vehicle.id}`}
                  className="rounded-xl border border-neutral-900 bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-700"
                >
                  + 新規作成
                </Link>
              </div>

              {certRows.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="bg-neutral-50">
                        <th className="p-3 text-left font-semibold text-neutral-600">作成日</th>
                        <th className="p-3 text-left font-semibold text-neutral-600">証明番号</th>
                        <th className="p-3 text-left font-semibold text-neutral-600">施工内容</th>
                        <th className="p-3 text-left font-semibold text-neutral-600">状態</th>
                        <th className="p-3 text-left font-semibold text-neutral-600">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {certRows.map((row) => {
                        const isVoid = String(row.status ?? "").toLowerCase() === "void";
                        return (
                          <tr key={row.id} className="border-t hover:bg-neutral-50">
                            <td className="p-3 whitespace-nowrap text-neutral-600">{fmt(row.created_at)}</td>
                            <td className="p-3 font-mono text-xs text-neutral-700">{row.certificate_no ?? "-"}</td>
                            <td className="p-3 text-neutral-900">{row.service_type ?? "-"}</td>
                            <td className="p-3">
                              <StatusBadge status={row.status} />
                            </td>
                            <td className="p-3">
                              <div className="flex gap-2">
                                {row.public_id ? (
                                  <>
                                    <Link
                                      href={`/admin/certificates/${row.public_id}`}
                                      className="rounded-lg border border-neutral-300 bg-white px-2.5 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-100"
                                    >
                                      詳細
                                    </Link>
                                    <a
                                      href={`/c/${row.public_id}`}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="rounded-lg border border-neutral-300 bg-white px-2.5 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-100"
                                    >
                                      公開
                                    </a>
                                  </>
                                ) : null}
                                {isVoid ? (
                                  <span className="rounded-lg bg-neutral-100 px-2.5 py-1 text-xs text-neutral-400">
                                    無効済み
                                  </span>
                                ) : (
                                  <form action={voidCertificate}>
                                    <input type="hidden" name="certificate_id" value={row.id} />
                                    <button
                                      type="submit"
                                      className="rounded-lg border border-red-200 px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                                    >
                                      無効化
                                    </button>
                                  </form>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="rounded-xl bg-neutral-50 p-6 text-center text-sm text-neutral-500">
                  証明書はまだありません。
                </div>
              )}
            </section>

            {/* 履歴タイムライン */}
            <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
              <div className="mb-4">
                <div className="text-xs font-semibold tracking-[0.18em] text-neutral-500">HISTORY</div>
                <div className="mt-1 text-lg font-semibold text-neutral-900">施工・整備履歴</div>
              </div>

              {historyRows.length > 0 ? (
                <div className="relative pl-4">
                  <div className="absolute left-0 top-2 bottom-2 w-px bg-neutral-200" />
                  <div className="space-y-4">
                    {historyRows.map((row) => {
                      // Find matching cert row to get public_id for linking
                      const linkedCert = row.certificate_id
                        ? certRows.find((c) => c.id === row.certificate_id)
                        : null;
                      const typeColor =
                        row.type === "certificate_issued"
                          ? "border-emerald-200 bg-emerald-50"
                          : row.type === "certificate_voided"
                          ? "border-red-100 bg-red-50"
                          : "border-neutral-100 bg-neutral-50";
                      const dotColor =
                        row.type === "certificate_issued"
                          ? "border-emerald-400 bg-emerald-100"
                          : row.type === "certificate_voided"
                          ? "border-red-300 bg-red-100"
                          : "border-neutral-300 bg-white";
                      return (
                        <div key={row.id} className="relative">
                          <div className={`absolute -left-[17px] top-1.5 h-2.5 w-2.5 rounded-full border-2 ${dotColor}`} />
                          <div className={`rounded-xl border p-3 ${typeColor}`}>
                            <div className="flex items-start justify-between gap-2">
                              <div className="text-sm font-semibold text-neutral-900">{row.title}</div>
                              {linkedCert?.public_id ? (
                                <Link
                                  href={`/admin/certificates/${linkedCert.public_id}`}
                                  className="shrink-0 rounded-md border border-neutral-300 bg-white px-2 py-0.5 text-[11px] font-medium text-neutral-600 hover:bg-neutral-50"
                                >
                                  詳細 →
                                </Link>
                              ) : null}
                            </div>
                            <div className="mt-0.5 text-xs text-neutral-400">
                              {fmtDt(row.performed_at)}{row.type ? ` · ${row.type}` : ""}
                            </div>
                            {row.description ? (
                              <div className="mt-2 text-sm leading-relaxed text-neutral-700 whitespace-pre-wrap">
                                {row.description}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="rounded-xl bg-neutral-50 p-6 text-center text-sm text-neutral-500">
                  履歴はまだありません。
                </div>
              )}
            </section>
          </div>

          {/* Right sidebar */}
          <aside className="space-y-6">

            {/* 車両情報 */}
            <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
              <div className="mb-4">
                <div className="text-xs font-semibold tracking-[0.18em] text-neutral-500">VEHICLE INFO</div>
                <div className="mt-1 text-lg font-semibold text-neutral-900">車両情報</div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <InfoRow label="メーカー" value={vehicle.maker} />
                <InfoRow label="車種" value={vehicle.model} />
                <InfoRow label="年式" value={vehicle.year} />
                <InfoRow label="ナンバー" value={vehicle.plate_display} />
                <InfoRow label="顧客名" value={vehicle.customer_name} />
                <InfoRow label="顧客メール" value={vehicle.customer_email} />
                {vehicle.customer_phone_masked ? (
                  <InfoRow label="電話" value={vehicle.customer_phone_masked} />
                ) : null}
              </div>
              {vehicle.notes ? (
                <div className="mt-3 rounded-xl bg-neutral-50 p-3">
                  <div className="text-[11px] font-semibold tracking-wide text-neutral-400 uppercase">メモ</div>
                  <div className="mt-1 text-sm text-neutral-700 whitespace-pre-wrap">{vehicle.notes}</div>
                </div>
              ) : null}
            </section>

            {/* NFCタグ */}
            {tagRows.length > 0 ? (
              <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
                <div className="mb-4">
                  <div className="text-xs font-semibold tracking-[0.18em] text-neutral-500">NFC TAGS</div>
                  <div className="mt-1 text-lg font-semibold text-neutral-900">NFCタグ</div>
                </div>
                <div className="space-y-3">
                  {tagRows.map((row) => (
                    <div key={row.id} className="rounded-xl border border-neutral-100 bg-neutral-50 p-3 text-sm space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-xs text-neutral-700">{row.tag_code}</span>
                        <span className="rounded-full bg-white border border-neutral-200 px-2 py-0.5 text-xs text-neutral-600">
                          {row.status}
                        </span>
                      </div>
                      <div className="text-xs text-neutral-400">
                        書込: {fmtDt(row.written_at)} · 貼付: {fmtDt(row.attached_at)}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}
          </aside>
        </div>
      </div>
    </main>
  );
}
