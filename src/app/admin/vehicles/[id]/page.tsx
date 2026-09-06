import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole, requirePermission } from "@/lib/auth/checkRole";
import { voidCertificate as voidCertificateRecord } from "@/lib/certificates/voidCertificate";
import { formatDate, formatDateTime } from "@/lib/format";
import ServiceTimeline, { type TimelineEvent } from "./ServiceTimeline";
import VehicleCustomerLink from "./VehicleCustomerLink";
import VehicleTagQr from "./VehicleTagQr";
import { qrSvgDataUrl } from "@/lib/qr";

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
  // タグ (NFC/QR) からの作業開始導線。/s/v/[publicId] が ?start=1 で送ってくる。
  const startFlag = Array.isArray(sp?.start) ? sp?.start[0] : sp?.start;

  const supabase = await createSupabaseServerClient();

  // active_tenant_id cookie を尊重してテナントを解決する (複数店舗スタッフ対応)。
  // タグ経由 (/s/v) は解決した車両の店舗を active にしてから遷移してくる。
  const caller = await resolveCallerWithRole(supabase);

  if (!caller) {
    return <div className="p-6 text-primary">ログインしてください。</div>;
  }
  const tenantId = caller.tenantId;
  // 権限が無いユーザーに、押しても必ず失敗する削除ボタンを見せない
  // (表示制御であって強制ではない。強制は voidCertificate 内で行う)。
  const canVoid = requirePermission(caller, "certificates:void");

  async function voidCertificate(formData: FormData) {
    "use server";

    const certId = String(formData.get("certificate_id") ?? "").trim();
    if (!certId) {
      redirect(`/admin/vehicles/${id}?e=1`);
    }

    const supabase = await createSupabaseServerClient();

    // 画面表示と同じ active テナントで解決する (複数店舗スタッフで削除が別店舗を
    // 探して失敗するのを防ぐ)。
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) {
      redirect("/login");
    }
    // 証明書の無効化は不可逆で法的意味を持つ (operationRisk = critical)。API 側の
    // 4経路はすべて certificates:void (admin+) を要求するが、この Server Action は
    // RLS 任せだった。certificates の UPDATE は PERMISSIVE ポリシー2本
    // (cert_update_member = テナントメンバー全員 / certificates_update_v2 =
    // owner・admin・staff) の OR で評価されるため、**viewer でも無効化が通っていた**。
    if (!requirePermission(caller, "certificates:void")) {
      redirect(`/admin/vehicles/${id}?e=1`);
    }
    const membershipTenantId = caller.tenantId;

    // 無効化の本体は `@/lib/certificates/voidCertificate` に一本化（5経路で実装が
    // 食い違っていた）。この Server Action と同名なので別名で読み込んでいる。
    // この経路だけ証明書監査ログに残っていなかったが、一本化で揃う。
    //
    // **自前で `vehicle_histories` に insert してはいけない。**
    // `voidCertificateRecord` → `logCertificateAction` が
    // 同じ表・同じ type（`certificate_voided`）へ1行入れるので、
    // 両方やるとタイムラインと監査が二重になる（PR #1027 の Codex レビュー指摘）。
    // 一本化のときに、以前この経路が持っていた insert を消し忘れていた。
    const result = await voidCertificateRecord(supabase, {
      tenantId: membershipTenantId,
      userId: caller.userId,
      selector: { certificateId: certId, vehicleId: id },
      // description は渡さない。既定が `Public ID: … / User: …` を組み立てるので、
      // 以前この経路が自前で書いていた `Public ID: …` を含んだ上で情報が増える。
    });

    if (!result.ok) {
      redirect(`/admin/vehicles/${id}?e=1`);
    }
    if (result.alreadyVoid) {
      redirect(`/admin/vehicles/${id}?voided=1`);
    }

    redirect(`/admin/vehicles/${id}?voided=1`);
  }

  type VehicleDetailRow = {
    id: string;
    maker: string | null;
    model: string | null;
    year: number | null;
    plate_display: string | null;
    vin_code: string | null;
    notes: string | null;
    created_at: string | null;
    updated_at: string | null;
    customer_id: string | null;
    customer: { id: string; name: string | null } | null;
    // 新カラム (存在しないテナントもあるので optional)
    size_class?: string | null;
    public_id?: string | null;
  };
  const { data: vehicle, error: vehicleError } = await supabase
    .from("vehicles")
    .select("*, customer:customers(id, name)")
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .single<VehicleDetailRow>();

  if (vehicleError || !vehicle) {
    return <div className="p-6 text-primary">車両が見つかりません。</div>;
  }

  // 車両タグ (NFC/QR) に焼く公開 URL と印刷用 QR。public_id が無い車両
  // (バックフィル前など) はタグ表示をスキップする。
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.ledra.co.jp";
  const tagUrl = vehicle.public_id ? `${appUrl}/s/v/${vehicle.public_id}` : null;
  const tagQrDataUrl = tagUrl ? await qrSvgDataUrl(tagUrl) : null;

  const { data: certs } = await supabase
    .from("certificates")
    .select("id, public_id, service_type, created_at, status")
    .eq("tenant_id", tenantId)
    .eq("vehicle_id", id)
    .order("created_at", { ascending: false });

  // vehicle_histories は新旧スキーマが混在する可能性があるため
  // 想定される全カラムを select("*") で取得し、実行時に両対応する。
  // スキーマ移行期間中のため title/label・description/note など両方の
  // カラムが出現しうる。後段で両方読むので optional にしておく。
  type VehicleHistoryRow = {
    id: string;
    type?: string | null;
    title?: string | null;
    label?: string | null;
    description?: string | null;
    note?: string | null;
    performed_at?: string | null;
    created_at?: string | null;
    certificate_id?: string | null;
  };
  const { data: historiesRaw } = await supabase
    .from("vehicle_histories")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("vehicle_id", id)
    .order("created_at", { ascending: false })
    .returns<VehicleHistoryRow[]>();

  const { data: tags } = await supabase
    .from("nfc_tags")
    .select("id, tag_code, status, written_at, attached_at, certificate_id")
    .eq("tenant_id", tenantId)
    .eq("vehicle_id", id)
    .order("created_at", { ascending: false });

  // 予約イベント: 作業開始・完了を時系列に混ぜる
  const { data: reservations } = await supabase
    .from("reservations")
    .select("id, title, status, scheduled_date, start_time, end_time, created_at, updated_at")
    .eq("tenant_id", tenantId)
    .eq("vehicle_id", id)
    .order("scheduled_date", { ascending: false });

  // NexPTG膜厚測定レポート（thickness_reports ＋ 測定値サマリ）
  const { data: thicknessReports } = await supabase
    .from("thickness_reports")
    .select(
      "id, name, measured_at, device_serial_number, comment, unit_of_measure, thickness_measurements(value_um, interpretation, is_inside)",
    )
    .eq("tenant_id", tenantId)
    .eq("vehicle_id", id)
    .order("measured_at", { ascending: false });

  // ─── タイムラインイベントを合成 ───
  const timelineEvents: TimelineEvent[] = [];

  // 1) vehicle_histories (新旧スキーマ両対応)
  for (const h of historiesRaw ?? []) {
    const occurredAt = h.performed_at ?? h.created_at ?? null;
    if (!occurredAt) continue;

    const type = String(h.type ?? "").toLowerCase();
    // 膜厚測定は thickness_reports から直接描画するため重複を避ける
    if (type.includes("thickness")) continue;

    const title = h.title ?? h.label ?? "車両履歴イベント";
    const description = h.description ?? h.note ?? null;

    const isVoid = type.includes("void") || title.includes("削除");
    const isCertificate = type.includes("certificate") || title.includes("証明書") || !!h.certificate_id;

    timelineEvents.push({
      key: `history-${h.id}`,
      kindLabel: isVoid ? "証明書削除" : isCertificate ? "証明書" : "履歴",
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
      description: c.public_id ? `No. ${c.public_id}` : null,
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
      description: r.start_time || r.end_time ? `${r.start_time ?? "-"}${r.end_time ? ` 〜 ${r.end_time}` : ""}` : null,
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

  // 5) NexPTG膜厚測定レポート
  for (const report of thicknessReports ?? []) {
    const occurredAt = (report as any).measured_at ?? null;
    if (!occurredAt) continue;

    const measurements = ((report as any).thickness_measurements ?? []) as Array<{
      value_um: number | null;
      interpretation: number | null;
      is_inside: boolean;
    }>;
    const count = measurements.length;
    let maxValue: number | null = null;
    let maxInterpretation: number | null = null;
    for (const m of measurements) {
      if (typeof m.value_um === "number" && (maxValue === null || m.value_um > maxValue)) {
        maxValue = m.value_um;
      }
      if (
        typeof m.interpretation === "number" &&
        (maxInterpretation === null || m.interpretation > maxInterpretation)
      ) {
        maxInterpretation = m.interpretation;
      }
    }

    const unit = (report as any).unit_of_measure ?? "μm";
    const parts: string[] = [];
    if (count > 0) parts.push(`測定値 ${count}件`);
    if (maxValue !== null) parts.push(`最大 ${maxValue}${unit}`);
    if (maxInterpretation !== null) parts.push(`判定最大 ${maxInterpretation}`);
    const summary = parts.length > 0 ? parts.join(" ・ ") : null;
    const comment = ((report as any).comment as string | null)?.trim() || null;
    const serial = (report as any).device_serial_number as string | null;
    const description = [summary, comment, serial ? `機器: ${serial}` : null].filter(Boolean).join("\n") || null;

    timelineEvents.push({
      key: `thickness-${(report as any).id}`,
      kindLabel: "膜厚測定",
      kindVariant: "thickness",
      title: (report as any).name ? `膜厚測定（NexPTG）: ${(report as any).name}` : "膜厚測定（NexPTG）",
      description,
      occurredAt,
      href: `/admin/vehicles/${id}/thickness/${(report as any).id}`,
    });
  }

  // 降順ソート (新しい順)
  timelineEvents.sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());

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
          <Link href={`/admin/vehicles/${vehicle.id}/edit`} className="btn-secondary">
            編集
          </Link>
          <Link href={`/admin/certificates/new?vehicle_id=${vehicle.id}`} className="btn-primary">
            + 証明書を作成
          </Link>
        </div>
      </div>

      {savedFlag ? (
        <div className="rounded-xl border border-success/30 bg-success-dim p-3 text-sm text-success-text">
          車両情報を保存しました。
        </div>
      ) : null}

      {voidedFlag ? (
        <div className="rounded-xl border border-warning/30 bg-warning-dim p-3 text-sm text-warning-text">
          証明書を削除しました。内部的には履歴保全のため「void（無効化）」として処理しています。
        </div>
      ) : null}

      {errFlag ? (
        <div className="rounded-xl border border-red-500/30 bg-[rgba(239,68,68,0.1)] p-3 text-sm text-red-500">
          処理に失敗しました。
        </div>
      ) : null}

      {startFlag ? (
        <section className="glass-card border-accent/40 bg-accent-dim p-6 space-y-3">
          <h2 className="text-lg font-semibold text-primary">この車両の作業を開始</h2>
          <p className="text-sm text-secondary">
            タグを読み取りました。作業内容を選んで開始してください。証明書作成では作業メニュー別の必須写真がガイドされます。
          </p>
          <div className="flex flex-wrap gap-2">
            <Link href={`/admin/certificates/new?vehicle_id=${vehicle.id}`} className="btn-primary">
              施工証明書を作成（写真ガイド）
            </Link>
            <Link
              href={`/admin/jobs/new?vehicle_id=${vehicle.id}${vehicle.customer_id ? `&customer_id=${vehicle.customer_id}` : ""}`}
              className="btn-secondary"
            >
              作業・予約を登録
            </Link>
          </div>
        </section>
      ) : null}

      <section className="glass-card p-6 space-y-3">
        <h2 className="text-lg font-semibold text-primary">車両情報</h2>
        <div className="grid gap-3 md:grid-cols-2 text-sm text-secondary">
          <div>メーカー: {vehicle.maker ?? "-"}</div>
          <div>車種: {vehicle.model ?? "-"}</div>
          <div>年式: {vehicle.year ?? "-"}</div>
          <div>ナンバー: {vehicle.plate_display ?? "-"}</div>
          <div>
            サイズ:{" "}
            {vehicle.size_class ? (
              <span className="inline-flex items-center rounded-md bg-accent-dim px-2 py-0.5 text-xs font-bold text-accent">
                {vehicle.size_class}
              </span>
            ) : (
              <span className="text-muted">未設定</span>
            )}
          </div>
          <div className="font-mono">車体番号: {vehicle.vin_code ?? "-"}</div>
          <VehicleCustomerLink vehicleId={vehicle.id} initialCustomer={vehicle.customer} />
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
                    <tr
                      key={row.id}
                      className="border-t border-border-default hover:bg-surface-hover transition-colors"
                    >
                      <td className="px-4 py-3 text-primary">{row.public_id ?? "-"}</td>
                      <td className="px-4 py-3 text-primary">{row.service_type ?? "-"}</td>
                      <td className="px-4 py-3 text-primary">{formatDate(row.created_at)}</td>
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
                        ) : !canVoid ? (
                          <span className="text-xs text-muted">-</span>
                        ) : (
                          <form action={voidCertificate}>
                            <input type="hidden" name="certificate_id" value={row.id} />
                            <button type="submit" className="btn-danger text-xs">
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
          <h2 className="text-lg font-semibold text-primary">サービス履歴タイムライン</h2>
          <span className="text-xs text-muted">証明書 / 予約 / NFC を時系列で統合表示</span>
        </div>
        <ServiceTimeline events={timelineEvents} />
      </section>

      {tagQrDataUrl && tagUrl ? (
        <section className="glass-card p-6 space-y-4">
          <h2 className="text-lg font-semibold text-primary">車両タグ (QR)</h2>
          <VehicleTagQr dataUrl={tagQrDataUrl} tagUrl={tagUrl} />
        </section>
      ) : null}

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
                    <td className="px-4 py-3 text-primary">{formatDateTime(row.written_at)}</td>
                    <td className="px-4 py-3 text-primary">{formatDateTime(row.attached_at)}</td>
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
