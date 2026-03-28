import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { formatDate, formatDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

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

  if (!user) {
    return <div className="p-6 text-primary">ログインしてください。</div>;
  }

  const { data: membership } = await supabase
    .from("tenant_memberships")
    .select("tenant_id")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (!membership?.tenant_id) {
    return <div className="p-6 text-primary">tenant が見つかりません。</div>;
  }

  async function voidCertificate(formData: FormData) {
    "use server";

    const certId = String(formData.get("certificate_id") ?? "").trim();
    if (!certId) {
      redirect(`/admin/vehicles/${id}?e=1`);
    }

    const supabase = await createSupabaseServerClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      redirect("/login");
    }

    const { data: membership } = await supabase
      .from("tenant_memberships")
      .select("tenant_id")
      .eq("user_id", user.id)
      .limit(1)
      .single();

    if (!membership?.tenant_id) {
      redirect(`/admin/vehicles/${id}?e=1`);
    }

    const existing = await supabase
      .from("certificates")
      .select("id, tenant_id, vehicle_id, public_id, status")
      .eq("tenant_id", membership.tenant_id)
      .eq("vehicle_id", id)
      .eq("id", certId)
      .limit(1)
      .maybeSingle();

    if (existing.error || !existing.data?.id) {
      redirect(`/admin/vehicles/${id}?e=1`);
    }

    if (String(existing.data.status ?? "").toLowerCase() === "void") {
      redirect(`/admin/vehicles/${id}?voided=1`);
    }

    const nowIso = new Date().toISOString();

    const updated = await supabase
      .from("certificates")
      .update({
        status: "void",
        updated_at: nowIso,
      })
      .eq("tenant_id", membership.tenant_id)
      .eq("vehicle_id", id)
      .eq("id", certId);

    if (updated.error) {
      redirect(`/admin/vehicles/${id}?e=1`);
    }

    await supabase.from("vehicle_histories").insert({
      tenant_id: membership.tenant_id,
      vehicle_id: id,
      type: "certificate_voided",
      title: "施工証明書を削除",
      description: existing.data.public_id ? `Public ID: ${existing.data.public_id}` : null,
      performed_at: nowIso,
      certificate_id: certId,
    });

    redirect(`/admin/vehicles/${id}?voided=1`);
  }

  type VehicleWithCustomer = NonNullable<Awaited<ReturnType<typeof supabase.from<"vehicles">>>["data"]>[number] & {
    size_class?: string | null;
    customer: { id: string; name: string } | null;
  };

  const { data: vehicle, error: vehicleError } = await supabase
    .from("vehicles")
    .select("*, customer:customers(id, name)")
    .eq("tenant_id", membership.tenant_id)
    .eq("id", id)
    .single() as { data: VehicleWithCustomer | null; error: typeof vehicleError };

  if (vehicleError || !vehicle) {
    return <div className="p-6 text-primary">車両が見つかりません。</div>;
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

  return (
    <div className="p-6 space-y-8">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-primary">
            {[vehicle.maker, vehicle.model].filter(Boolean).join(" ")}
          </h1>
          <p className="text-sm text-muted">
            {vehicle.year ?? "-"} / {vehicle.plate_display ?? "-"}
          </p>
        </div>

        <div className="flex gap-2">
          <Link
            href={`/admin/vehicles/${vehicle.id}/edit`}
            className="btn-secondary"
          >
            編集
          </Link>
          <Link
            href={`/admin/certificates/new?vehicle_id=${vehicle.id}`}
            className="btn-primary"
          >
            + 証明書を作成
          </Link>
        </div>
      </div>

      {savedFlag ? (
        <div className="rounded-xl border border-emerald-500/30 bg-[rgba(16,185,129,0.1)] p-3 text-sm text-emerald-400">
          車両情報を保存しました。
        </div>
      ) : null}

      {voidedFlag ? (
        <div className="rounded-xl border border-amber-500/30 bg-[rgba(245,158,11,0.1)] p-3 text-sm text-amber-400">
          証明書を削除しました。内部的には履歴保全のため「void（無効化）」として処理しています。
        </div>
      ) : null}

      {errFlag ? (
        <div className="rounded-xl border border-red-500/30 bg-[rgba(239,68,68,0.1)] p-3 text-sm text-red-500">
          処理に失敗しました。
        </div>
      ) : null}

      <section className="glass-card p-6 space-y-3">
        <h2 className="text-lg font-semibold text-primary">車両情報</h2>
        <div className="grid gap-3 md:grid-cols-2 text-sm text-secondary">
          <div>メーカー: {vehicle.maker ?? "-"}</div>
          <div>車種: {vehicle.model ?? "-"}</div>
          <div>年式: {vehicle.year ?? "-"}</div>
          <div>ナンバー: {vehicle.plate_display ?? "-"}</div>
          <div>
            サイズ: {vehicle.size_class ? (
              <span className="inline-flex items-center rounded-md bg-accent-dim px-2 py-0.5 text-xs font-bold text-accent">
                {vehicle.size_class}
              </span>
            ) : <span className="text-muted">未設定</span>}
          </div>
          <div className="font-mono">車体番号: {vehicle.vin_code ?? "-"}</div>
          <div>
            現所有者: {vehicle.customer?.name ?? <span className="text-muted">未設定</span>}
          </div>
        </div>
        {vehicle.notes ? <div className="text-sm text-secondary">メモ: {vehicle.notes}</div> : null}
      </section>

      <section className="glass-card p-6 space-y-4">
        <h2 className="text-lg font-semibold text-primary">証明書</h2>
        {certs && certs.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-base">
                <tr>
                  <th className="px-4 py-3 text-left text-secondary">証明番号</th>
                  <th className="px-4 py-3 text-left text-secondary">施工内容</th>
                  <th className="px-4 py-3 text-left text-secondary">作成日</th>
                  <th className="px-4 py-3 text-left text-secondary">状態</th>
                  <th className="px-4 py-3 text-left text-secondary">公開</th>
                  <th className="px-4 py-3 text-left text-secondary">削除</th>
                </tr>
              </thead>
              <tbody>
                {certs.map((row) => {
                  const isVoid = String(row.status ?? "").toLowerCase() === "void";

                  return (
                    <tr key={row.id} className="border-t border-border-default hover:bg-surface-hover transition-colors">
                      <td className="px-4 py-3 text-primary">{row.certificate_no ?? "-"}</td>
                      <td className="px-4 py-3 text-primary">{row.service_type ?? "-"}</td>
                      <td className="px-4 py-3 text-primary">
                        {formatDate(row.created_at)}
                      </td>
                      <td className="px-4 py-3 text-primary">{row.status ?? "-"}</td>
                      <td className="px-4 py-3">
                        {row.public_id ? (
                          <a
                            href={`/c/${row.public_id}`}
                            target="_blank"
                            rel="noreferrer"
                            className="underline text-accent hover:text-accent"
                          >
                            表示
                          </a>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {isVoid ? (
                          <span className="text-xs text-muted">削除済み</span>
                        ) : (
                          <form action={voidCertificate}>
                            <input type="hidden" name="certificate_id" value={row.id} />
                            <button
                              type="submit"
                              className="btn-danger text-xs"
                            >
                              削除
                            </button>
                          </form>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-sm text-muted">証明書はまだありません。</div>
        )}
      </section>

      <section className="glass-card p-6 space-y-4">
        <h2 className="text-lg font-semibold text-primary">履歴タイムライン</h2>
        {histories && histories.length > 0 ? (
          <div className="space-y-3">
            {histories.map((row) => (
              <div key={row.id} className="rounded-xl border border-border-default bg-base p-4">
                <div className="text-sm font-medium text-primary">{row.title}</div>
                <div className="text-xs text-muted">
                  {formatDateTime(row.performed_at)} / {row.type}
                </div>
                {row.description ? <div className="mt-2 text-sm text-secondary">{row.description}</div> : null}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-sm text-muted">履歴はまだありません。</div>
        )}
      </section>

      <section className="glass-card p-6 space-y-4">
        <h2 className="text-lg font-semibold text-primary">NFCタグ</h2>
        {tags && tags.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-base">
                <tr>
                  <th className="px-4 py-3 text-left text-secondary">タグコード</th>
                  <th className="px-4 py-3 text-left text-secondary">状態</th>
                  <th className="px-4 py-3 text-left text-secondary">書込日時</th>
                  <th className="px-4 py-3 text-left text-secondary">貼付日時</th>
                </tr>
              </thead>
              <tbody>
                {tags.map((row) => (
                  <tr key={row.id} className="border-t border-border-default hover:bg-surface-hover transition-colors">
                    <td className="px-4 py-3 text-primary">{row.tag_code}</td>
                    <td className="px-4 py-3 text-primary">{row.status}</td>
                    <td className="px-4 py-3 text-primary">
                      {formatDateTime(row.written_at)}
                    </td>
                    <td className="px-4 py-3 text-primary">
                      {formatDateTime(row.attached_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-sm text-muted">NFCタグはまだありません。</div>
        )}
      </section>
    </div>
  );
}
