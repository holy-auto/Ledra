import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { formatDate, formatDateTime } from "@/lib/format";
import ServiceTimeline, { type TimelineEvent } from "./ServiceTimeline";

export const dynamic = "force-dynamic";

const RESERVATION_STATUS_LABEL: Record<string, string> = {
  confirmed: "予約確定",
  arrived: "来店・受付",
  in_progress: "作業中",
  completed: "完了・納車",
  cancelled: "キャンセル",
};

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

  const { data: vehicle, error: vehicleError } = await supabase
    .from("vehicles")
    .select("*, customer:customers(id, name)")
    .eq("tenant_id", membership.tenant_id)
    .eq("id", id)
    .single();

  if (vehicleError || !vehicle) {
    return <div className="p-6 text-primary">車両が見つかりません。</div>;
  }

  const { data: certs } = await supabase
    .from("certificates")
    .select("id, public_id, certificate_no, service_type, created_at, status")
    .eq("tenant_id", membership.tenant_id)
    .eq("vehicle_id", id)
    .order("created_at", { ascending: false });

  // vehicle_histories は新旧スキーマが混在する可能性があるため
  // 想定される全カラムを select("*") で取得し、実行時に両対応する。
  const { data: historiesRaw } = await supabase
    .from("vehicle_histories")
    .select("*")
    .eq("tenant_id", membership.tenant_id)
    .eq("vehicle_id", id)
    .order("created_at", { ascending: false });

  const { data: tags } = await supabase
    .from("nfc_tags")
    .select("id, tag_code, status, written_at, attached_at, certificate_id")
    .eq("tenant_id", membership.tenant_id)
    .eq("vehicle_id", id)
    .order("created_at", { ascending: false });

  // 予約イベント: 作業開始・完了を時系列に混ぜる
  const { data: reservations } = await supabase
    .from("reservations")
    .select(
      "id, title, status, scheduled_date, start_time, end_time, created_at, updated_at",
    )
    .eq("tenant_id", membership.tenant_id)
    .eq("vehicle_id", id)
    .order("scheduled_date", { ascending: false });

  // ─── タイムラインイベントを合成 ───
  const timelineEvents: TimelineEvent[] = [];

  // 1) vehicle_histories (新旧スキーマ両対応)
  for (const h of historiesRaw ?? []) {
    const occurredAt =
      (h as any).performed_at ?? (h as any).created_at ?? null;
    if (!occurredAt) continue;

    const title =
      (h as any).title ?? (h as any).label ?? "車両履歴イベント";
    const description =
      (h as any).description ?? (h as any).note ?? null;
    const type = String((h as any).type ?? "").toLowerCase();

    const isVoid = type.includes("void") || title.includes("削除");
    const isCertificate =
      type.includes("certificate") ||
      title.includes("証明書") ||
      !!(h as any).certificate_id;

    timelineEvents.push({
      key: `history-${(h as any).id}`,
      kindLabel: isVoid
        ? "証明書削除"
        : isCertificate
          ? "証明書"
          : "履歴",
      kindVariant: isVoid ? "void" : isCertificate ? "certificate" : "other",
      title,
      description,
      occurredAt,
    });
  }

  // 2) 証明書発行を独立イベントとして追加 (vehicle_histories に無いケース保険)
  for (const c of certs ?? []) {
    const isVoid = String(c.status ?? "").toLowerCase() === "void";
    if (isVoid) continue; // void は history 側で描画
    timelineEvents.push({
      key: `cert-${c.id}`,
      kindLabel: "証明書発行",
      kindVariant: "certificate",
      title: `証明書を発行 (${c.service_type ?? "施工"})`,
      description: c.certificate_no ? `No. ${c.certificate_no}` : null,
      occurredAt: c.created_at,
      href: c.public_id ? `/admin/certificates/${c.public_id}` : undefined,
    });
  }

  // 3) 予約イベント (作業中・完了のみタイムラインに出す。予約確定段階は情報量が薄いので除外)
  for (const r of reservations ?? []) {
    const status = String(r.status ?? "").toLowerCase();
    if (status !== "in_progress" && status !== "completed" && status !== "arrived") {
      continue;
    }
    const occurredAt = r.updated_at ?? r.scheduled_date;
    timelineEvents.push({
      key: `reservation-${r.id}-${status}`,
      kindLabel: RESERVATION_STATUS_LABEL[status] ?? status,
      kindVariant: "reservation",
      title: r.title ?? "(無題の予約)",
      description:
        r.start_time || r.end_time
          ? `${r.start_time ?? "-"}${r.end_time ? ` 〜 ${r.end_time}` : ""}`
          : null,
      occurredAt,
      href: `/admin/jobs/${r.id}`,
    });
  }

  // 4) NFC 書込イベント
  for (const t of tags ?? []) {
    if (t.written_at) {
      timelineEvents.push({
        key: `nfc-write-${t.id}`,
        kindLabel: "NFC書込",
        kindVariant: "nfc",
        title: `NFCタグ ${t.tag_code} を書込`,
        description: null,
        occurredAt: t.written_at,
      });
    }
  }

  // 降順ソート (新しい順)
  timelineEvents.sort(
    (a, b) =>
      new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
  );

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
            サイズ: {(vehicle as any).size_class ? (
              <span className="inline-flex items-center rounded-md bg-accent-dim px-2 py-0.5 text-xs font-bold text-accent">
                {(vehicle as any).size_class}
              </span>
            ) : <span className="text-muted">未設定</span>}
          </div>
          <div className="font-mono">車体番号: {vehicle.vin_code ?? "-"}</div>
          <div>
            現所有者: {(vehicle as any).customer?.name ?? <span className="text-muted">未設定</span>}
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
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-primary">
            サービス履歴タイムライン
          </h2>
          <span className="text-xs text-muted">
            証明書 / 予約 / NFC を時系列で統合表示
          </span>
        </div>
        <ServiceTimeline events={timelineEvents} />
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
