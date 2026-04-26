import Link from "next/link";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { formatDate, formatDateTime } from "@/lib/format";
import PageHeader from "@/components/ui/PageHeader";
import {
  ExteriorDiagram,
  InteriorDiagram,
  VehicleDiagramLegend,
  type PanelInfo,
} from "@/components/thickness/VehicleDiagram";

export const dynamic = "force-dynamic";

const SECTION_JA: Record<string, string> = {
  LEFT_FRONT_FENDER: "左フロントフェンダー",
  LEFT_FRONT_DOOR: "左フロントドア",
  LEFT_REAR_DOOR: "左リアドア",
  LEFT_PILLAR: "左ピラー",
  LEFT_REAR_FENDER: "左リアフェンダー",
  RIGHT_FRONT_FENDER: "右フロントフェンダー",
  RIGHT_FRONT_DOOR: "右フロントドア",
  RIGHT_REAR_DOOR: "右リアドア",
  RIGHT_PILLAR: "右ピラー",
  RIGHT_REAR_FENDER: "右リアフェンダー",
  HOOD: "ボンネット",
  ROOF: "ルーフ",
  TRUNK: "トランク",
  LEFT_SIDE: "左側（内装）",
  RIGHT_SIDE: "右側（内装）",
  ENGINE_COMPARTMENT: "エンジンルーム",
  TRUNK_INSIDE: "トランク内装",
};

const PLACE_JA: Record<string, string> = {
  left: "左",
  right: "右",
  top: "上面",
  back: "後部",
};

const INTERPRETATION_LABEL: Record<number, { label: string; cls: string }> = {
  1: { label: "1 (純正相当)", cls: "bg-success-dim text-success-text border-success/20" },
  2: { label: "2 (やや厚め)", cls: "bg-success-dim text-success-text border-success/20" },
  3: { label: "3 (補修疑い)", cls: "bg-warning-dim text-warning-text border-warning/20" },
  4: { label: "4 (再塗装疑い)", cls: "bg-warning-dim text-warning-text border-warning/20" },
  5: { label: "5 (要確認)", cls: "bg-danger-dim text-danger-text border-danger/20" },
};

function sectionLabel(section: string): string {
  return SECTION_JA[section] ?? section;
}

type Measurement = {
  id: string;
  is_inside: boolean;
  place_id: string;
  section: string;
  position: number | null;
  value_um: number | null;
  raw_value: string | null;
  interpretation: number | null;
  material: string | null;
  measured_at: string | null;
};

type Tire = {
  id: string;
  section: string | null;
  maker: string | null;
  season: string | null;
  width: string | null;
  profile: string | null;
  diameter: string | null;
  value1: string | null;
  value2: string | null;
};

type SectionGroup = {
  section: string;
  count: number;
  maxValue: number | null;
  avgValue: number | null;
  maxInterpretation: number | null;
  materials: string[];
  items: Measurement[];
};

function groupBySection(items: Measurement[]): SectionGroup[] {
  const map = new Map<string, Measurement[]>();
  for (const m of items) {
    const key = m.section;
    const arr = map.get(key);
    if (arr) arr.push(m);
    else map.set(key, [m]);
  }

  return [...map.entries()]
    .map(([section, ms]) => {
      let maxValue: number | null = null;
      let sum = 0;
      let numeric = 0;
      let maxInterp: number | null = null;
      const materialSet = new Set<string>();
      for (const m of ms) {
        if (typeof m.value_um === "number") {
          sum += m.value_um;
          numeric += 1;
          if (maxValue === null || m.value_um > maxValue) maxValue = m.value_um;
        }
        if (typeof m.interpretation === "number") {
          if (maxInterp === null || m.interpretation > maxInterp) maxInterp = m.interpretation;
        }
        if (m.material) materialSet.add(m.material);
      }
      ms.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
      return {
        section,
        count: ms.length,
        maxValue,
        avgValue: numeric > 0 ? Math.round((sum / numeric) * 10) / 10 : null,
        maxInterpretation: maxInterp,
        materials: [...materialSet],
        items: ms,
      };
    })
    .sort((a, b) => sectionLabel(a.section).localeCompare(sectionLabel(b.section), "ja"));
}

export default async function ThicknessReportDetailPage({
  params,
}: {
  params: Promise<{ id: string; reportId: string }>;
}) {
  const { id: vehicleId, reportId } = await params;

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

  const { data: report } = await supabase
    .from("thickness_reports")
    .select(
      "id, name, measured_at, calibration_at, device_serial_number, brand, model, vin, year, type_of_body, capacity, power, fuel_type, unit_of_measure, comment",
    )
    .eq("tenant_id", membership.tenant_id)
    .eq("vehicle_id", vehicleId)
    .eq("id", reportId)
    .single();

  if (!report) {
    return <div className="p-6 text-primary">膜厚測定レポートが見つかりません。</div>;
  }

  const { data: measurementsRaw } = await supabase
    .from("thickness_measurements")
    .select("id, is_inside, place_id, section, position, value_um, raw_value, interpretation, material, measured_at")
    .eq("tenant_id", membership.tenant_id)
    .eq("report_id", reportId)
    .order("is_inside", { ascending: true })
    .order("place_id", { ascending: true })
    .order("section", { ascending: true })
    .order("position", { ascending: true });

  const { data: tiresRaw } = await supabase
    .from("thickness_tires")
    .select("id, section, maker, season, width, profile, diameter, value1, value2")
    .eq("report_id", reportId);

  const measurements = (measurementsRaw ?? []) as Measurement[];
  const tires = (tiresRaw ?? []) as Tire[];

  const unit: string = (report.unit_of_measure as string | null) ?? "μm";

  // 外装/内装 × placeId でグループ化
  const outside = measurements.filter((m) => !m.is_inside);
  const inside = measurements.filter((m) => m.is_inside);

  const placesOutside: Array<{ placeId: string; groups: SectionGroup[] }> = [];
  const placesInside: Array<{ placeId: string; groups: SectionGroup[] }> = [];

  for (const placeId of ["left", "right", "top", "back"]) {
    const outsideItems = outside.filter((m) => m.place_id === placeId);
    if (outsideItems.length > 0) placesOutside.push({ placeId, groups: groupBySection(outsideItems) });
    const insideItems = inside.filter((m) => m.place_id === placeId);
    if (insideItems.length > 0) placesInside.push({ placeId, groups: groupBySection(insideItems) });
  }

  // 判定分布
  const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let unrated = 0;
  for (const m of measurements) {
    if (typeof m.interpretation === "number" && distribution[m.interpretation] !== undefined) {
      distribution[m.interpretation] += 1;
    } else {
      unrated += 1;
    }
  }
  const total = measurements.length;
  const distMax = Math.max(1, ...Object.values(distribution));

  // 車体展開図用の集計（section → PanelInfo）
  const exteriorPanels: Record<string, PanelInfo> = {};
  for (const place of placesOutside) {
    for (const g of place.groups) {
      exteriorPanels[g.section] = {
        count: g.count,
        maxValue: g.maxValue,
        avgValue: g.avgValue,
        maxInterpretation: g.maxInterpretation,
        materials: g.materials,
      };
    }
  }
  const interiorPanels: Record<string, PanelInfo> = {};
  for (const place of placesInside) {
    for (const g of place.groups) {
      interiorPanels[g.section] = {
        count: g.count,
        maxValue: g.maxValue,
        avgValue: g.avgValue,
        maxInterpretation: g.maxInterpretation,
        materials: g.materials,
      };
    }
  }
  const hasExterior = Object.keys(exteriorPanels).length > 0;
  const hasInterior = Object.keys(interiorPanels).length > 0;

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        tag="膜厚測定レポート"
        title={report.name ?? "膜厚測定レポート"}
        description={report.measured_at ? `測定日時: ${formatDateTime(report.measured_at)}` : undefined}
        actions={
          <Link href={`/admin/vehicles/${vehicleId}`} className="btn-secondary">
            ← 車両詳細に戻る
          </Link>
        }
      />

      {/* レポート情報 */}
      <section className="glass-card p-5">
        <div className="mb-4">
          <div className="text-xs font-semibold tracking-[0.18em] text-muted">レポート情報</div>
        </div>
        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 text-sm">
          {report.device_serial_number && (
            <div>
              <dt className="text-xs text-muted">測定機器</dt>
              <dd className="font-mono text-primary">{report.device_serial_number}</dd>
            </div>
          )}
          {report.calibration_at && (
            <div>
              <dt className="text-xs text-muted">最終校正日</dt>
              <dd className="text-primary">{formatDate(report.calibration_at)}</dd>
            </div>
          )}
          {(report.brand || report.model) && (
            <div>
              <dt className="text-xs text-muted">車両</dt>
              <dd className="text-primary">{[report.brand, report.model, report.year].filter(Boolean).join(" ")}</dd>
            </div>
          )}
          {report.vin && (
            <div>
              <dt className="text-xs text-muted">VIN</dt>
              <dd className="font-mono text-primary break-all">{report.vin}</dd>
            </div>
          )}
          {report.type_of_body && (
            <div>
              <dt className="text-xs text-muted">ボディタイプ</dt>
              <dd className="text-primary">{report.type_of_body}</dd>
            </div>
          )}
          {report.fuel_type && (
            <div>
              <dt className="text-xs text-muted">燃料</dt>
              <dd className="text-primary">{report.fuel_type}</dd>
            </div>
          )}
        </dl>
        {report.comment && (
          <div className="mt-4 rounded-lg bg-inset p-3 text-sm text-secondary whitespace-pre-wrap">
            {report.comment}
          </div>
        )}
      </section>

      {/* 判定分布 */}
      <section className="glass-card p-5">
        <div className="mb-4">
          <div className="text-xs font-semibold tracking-[0.18em] text-muted">判定分布</div>
          <div className="mt-1 text-base font-semibold text-primary">
            測定値 {total}件（未判定 {unrated}件）
          </div>
        </div>
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((level) => {
            const count = distribution[level];
            const pct = Math.round((count / distMax) * 100);
            return (
              <div key={level} className="flex items-center gap-3">
                <span
                  className={`inline-flex items-center justify-center rounded-full border px-2 py-0.5 text-[11px] font-semibold w-32 shrink-0 ${INTERPRETATION_LABEL[level].cls}`}
                >
                  {INTERPRETATION_LABEL[level].label}
                </span>
                <div className="flex-1 h-2 rounded-full bg-inset overflow-hidden">
                  <div
                    className="h-full bg-accent transition-all"
                    style={{ width: count === 0 ? "0%" : `${Math.max(4, pct)}%` }}
                  />
                </div>
                <span className="text-sm font-mono text-secondary w-10 text-right">{count}</span>
              </div>
            );
          })}
        </div>
      </section>

      {/* 車体展開図 */}
      {(hasExterior || hasInterior) && (
        <section className="glass-card p-5 space-y-5">
          <div>
            <div className="text-xs font-semibold tracking-[0.18em] text-muted">車体展開図</div>
            <div className="mt-1 text-base font-semibold text-primary">部位別の判定マップ</div>
            <p className="mt-1 text-xs text-muted">
              パネルにマウスを乗せると詳細を表示します。色は判定最大値（緑=1-2 / 黄=3-4 / 赤=5）。
            </p>
          </div>
          <VehicleDiagramLegend />
          {hasExterior && (
            <div>
              <div className="mb-2 text-sm font-semibold text-secondary">外装</div>
              <ExteriorDiagram panels={exteriorPanels} unit={unit} />
            </div>
          )}
          {hasInterior && (
            <div>
              <div className="mb-2 text-sm font-semibold text-secondary">内装</div>
              <InteriorDiagram panels={interiorPanels} unit={unit} />
            </div>
          )}
        </section>
      )}

      {/* 外装測定値 */}
      {placesOutside.length > 0 && (
        <section className="glass-card p-5 space-y-5">
          <div>
            <div className="text-xs font-semibold tracking-[0.18em] text-muted">外装</div>
            <div className="mt-1 text-base font-semibold text-primary">外装測定値</div>
          </div>
          {placesOutside.map((place) => (
            <div key={place.placeId}>
              <MeasurementTable placeId={place.placeId} groups={place.groups} unit={unit} />
            </div>
          ))}
        </section>
      )}

      {/* 内装測定値 */}
      {placesInside.length > 0 && (
        <section className="glass-card p-5 space-y-5">
          <div>
            <div className="text-xs font-semibold tracking-[0.18em] text-muted">内装</div>
            <div className="mt-1 text-base font-semibold text-primary">内装測定値</div>
          </div>
          {placesInside.map((place) => (
            <div key={place.placeId}>
              <MeasurementTable placeId={place.placeId} groups={place.groups} unit={unit} />
            </div>
          ))}
        </section>
      )}

      {measurements.length === 0 && (
        <section className="glass-card p-8 text-center text-sm text-muted">測定データはありません。</section>
      )}

      {/* タイヤ */}
      {tires.length > 0 && (
        <section className="glass-card p-5">
          <div className="mb-4">
            <div className="text-xs font-semibold tracking-[0.18em] text-muted">タイヤ</div>
            <div className="mt-1 text-base font-semibold text-primary">タイヤ情報</div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted border-b border-border-default">
                  <th className="text-left py-2 px-2 font-medium">位置</th>
                  <th className="text-left py-2 px-2 font-medium">メーカー</th>
                  <th className="text-left py-2 px-2 font-medium">シーズン</th>
                  <th className="text-left py-2 px-2 font-medium">サイズ</th>
                  <th className="text-right py-2 px-2 font-medium">値1</th>
                  <th className="text-right py-2 px-2 font-medium">値2</th>
                </tr>
              </thead>
              <tbody>
                {tires.map((t) => (
                  <tr key={t.id} className="border-b border-border-subtle">
                    <td className="py-2 px-2 text-primary">{t.section ?? "—"}</td>
                    <td className="py-2 px-2 text-primary">{t.maker ?? "—"}</td>
                    <td className="py-2 px-2 text-secondary">{t.season ?? "—"}</td>
                    <td className="py-2 px-2 font-mono text-secondary">
                      {[t.width, t.profile, t.diameter].filter(Boolean).join("/") || "—"}
                    </td>
                    <td className="py-2 px-2 font-mono text-right text-secondary">{t.value1 ?? "—"}</td>
                    <td className="py-2 px-2 font-mono text-right text-secondary">{t.value2 ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

function MeasurementTable({ placeId, groups, unit }: { placeId: string; groups: SectionGroup[]; unit: string }) {
  return (
    <div>
      <div className="mb-2 text-sm font-semibold text-secondary">{PLACE_JA[placeId] ?? placeId}</div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-muted border-b border-border-default">
              <th className="text-left py-2 px-2 font-medium">部位</th>
              <th className="text-right py-2 px-2 font-medium">件数</th>
              <th className="text-right py-2 px-2 font-medium">最大</th>
              <th className="text-right py-2 px-2 font-medium">平均</th>
              <th className="text-left py-2 px-2 font-medium">材質</th>
              <th className="text-left py-2 px-2 font-medium">判定最大</th>
              <th className="text-left py-2 px-2 font-medium">測定値詳細</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <tr key={g.section} className="border-b border-border-subtle align-top">
                <td className="py-2 px-2 font-medium text-primary">{sectionLabel(g.section)}</td>
                <td className="py-2 px-2 text-right font-mono text-secondary">{g.count}</td>
                <td className="py-2 px-2 text-right font-mono text-primary">
                  {g.maxValue !== null ? `${g.maxValue}${unit}` : "—"}
                </td>
                <td className="py-2 px-2 text-right font-mono text-secondary">
                  {g.avgValue !== null ? `${g.avgValue}${unit}` : "—"}
                </td>
                <td className="py-2 px-2 text-secondary">{g.materials.join(", ") || "—"}</td>
                <td className="py-2 px-2">
                  {g.maxInterpretation !== null ? (
                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${INTERPRETATION_LABEL[g.maxInterpretation]?.cls ?? ""}`}
                    >
                      {INTERPRETATION_LABEL[g.maxInterpretation]?.label ?? g.maxInterpretation}
                    </span>
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </td>
                <td className="py-2 px-2 text-xs text-secondary">
                  <ul className="space-y-0.5">
                    {g.items.map((m) => (
                      <li key={m.id} className="font-mono">
                        {m.position !== null ? `#${m.position}: ` : ""}
                        {m.raw_value ?? "—"}
                        {unit}
                        {m.material ? ` (${m.material})` : ""}
                        {typeof m.interpretation === "number" ? ` / 判定 ${m.interpretation}` : ""}
                      </li>
                    ))}
                  </ul>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
