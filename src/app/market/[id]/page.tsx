import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { formatJpy, formatDate } from "@/lib/format";
import Badge from "@/components/ui/Badge";
import ImageGallery from "./ImageGallery";
import InquiryForm from "./InquiryForm";

export const dynamic = "force-dynamic";

const statusLabel = (s: string) => {
  switch (s) {
    case "listed": return "出品中";
    case "reserved": return "商談中";
    case "sold": return "成約済";
    case "draft": return "下書き";
    case "withdrawn": return "取下げ";
    default: return s;
  }
};

const statusVariant = (s: string) => {
  switch (s) {
    case "listed": return "success" as const;
    case "reserved": return "warning" as const;
    case "sold": return "info" as const;
    case "withdrawn": return "danger" as const;
    default: return "default" as const;
  }
};

export default async function MarketVehicleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const supabase = await createSupabaseServerClient();
  const caller = await resolveCallerWithRole(supabase);
  if (!caller) redirect(`/login?next=/market/${id}`);

  const { data: vehicles } = await supabase
    .from("market_vehicles")
    .select("*")
    .eq("id", id)
    .eq("status", "listed");

  if (!vehicles || vehicles.length === 0) notFound();
  const vehicle = vehicles[0];

  // Fetch images
  const { data: images } = await supabase
    .from("market_vehicle_images")
    .select("*")
    .eq("vehicle_id", id)
    .order("sort_order", { ascending: true });

  const vehicleImages = images ?? [];

  const specRows: [string, string | null][] = [
    ["メーカー", vehicle.maker],
    ["車種", vehicle.model],
    ["グレード", vehicle.grade],
    ["年式", vehicle.year ? `${vehicle.year}年` : null],
    ["走行距離", vehicle.mileage != null ? `${vehicle.mileage.toLocaleString()} km` : null],
    ["色", vehicle.color],
    ["カラーコード", vehicle.color_code],
    ["ボディタイプ", vehicle.body_type],
    ["排気量", vehicle.displacement ? `${vehicle.displacement.toLocaleString()} cc` : null],
    ["トランスミッション", vehicle.transmission],
    ["駆動方式", vehicle.drive_type],
    ["燃料", vehicle.fuel_type],
    ["ドア数", vehicle.door_count ? `${vehicle.door_count}ドア` : null],
    ["定員", vehicle.seating_capacity ? `${vehicle.seating_capacity}名` : null],
    ["エンジン型式", vehicle.engine_type],
    ["車検満了日", vehicle.inspection_date ? formatDate(vehicle.inspection_date) : null],
    ["修復歴", vehicle.repair_history],
    ["評価点", vehicle.condition_grade],
  ];

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <div className="mb-6">
        <Link href="/market" className="text-sm text-accent hover:underline">← 在庫一覧に戻る</Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Images */}
        <ImageGallery images={vehicleImages} alt={`${vehicle.maker} ${vehicle.model}`} />

        {/* Right: Info */}
        <div className="space-y-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Badge variant={statusVariant(vehicle.status)}>{statusLabel(vehicle.status)}</Badge>
              {vehicle.tenant_name && <span className="text-xs text-muted">{vehicle.tenant_name}</span>}
            </div>
            <div className="text-xs text-muted">{vehicle.maker}</div>
            <h1 className="text-2xl font-bold text-primary">
              {vehicle.model}
              {vehicle.grade && <span className="text-lg text-secondary ml-2">{vehicle.grade}</span>}
            </h1>
          </div>

          {/* Price */}
          <div className="glass-card p-4 space-y-2">
            {vehicle.asking_price != null && (
              <div>
                <div className="text-xs text-muted">希望価格（税抜）</div>
                <div className="text-2xl font-bold text-primary">{formatJpy(vehicle.asking_price)}</div>
              </div>
            )}
            {vehicle.wholesale_price != null && (
              <div>
                <div className="text-xs text-muted">卸価格</div>
                <div className="text-lg font-semibold text-secondary">{formatJpy(vehicle.wholesale_price)}</div>
              </div>
            )}
          </div>

          {/* Quick specs */}
          <div className="flex gap-3 text-sm text-secondary flex-wrap">
            {vehicle.year && <span className="glass-card px-3 py-1.5">{vehicle.year}年式</span>}
            {vehicle.mileage != null && <span className="glass-card px-3 py-1.5">{vehicle.mileage.toLocaleString()} km</span>}
            {vehicle.color && <span className="glass-card px-3 py-1.5">{vehicle.color}</span>}
            {vehicle.transmission && <span className="glass-card px-3 py-1.5">{vehicle.transmission}</span>}
            {vehicle.fuel_type && <span className="glass-card px-3 py-1.5">{vehicle.fuel_type}</span>}
          </div>
        </div>
      </div>

      {/* Spec Table */}
      <section className="glass-card p-5 mt-6">
        <div className="text-xs font-semibold tracking-[0.18em] text-muted mb-4">SPECIFICATIONS</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1">
          {specRows.map(([label, value]) => value && (
            <div key={label} className="flex items-center justify-between py-2 border-b border-border-subtle text-sm">
              <span className="text-muted">{label}</span>
              <span className="text-primary font-medium">{value}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Condition */}
      {vehicle.condition_note && (
        <section className="glass-card p-5 mt-4">
          <div className="text-xs font-semibold tracking-[0.18em] text-muted mb-2">CONDITION NOTE</div>
          <p className="text-sm text-secondary whitespace-pre-wrap">{vehicle.condition_note}</p>
        </section>
      )}

      {/* Description */}
      {vehicle.description && (
        <section className="glass-card p-5 mt-4">
          <div className="text-xs font-semibold tracking-[0.18em] text-muted mb-2">DESCRIPTION</div>
          <p className="text-sm text-secondary whitespace-pre-wrap">{vehicle.description}</p>
        </section>
      )}

      {/* Features */}
      {vehicle.features && vehicle.features.length > 0 && (
        <section className="glass-card p-5 mt-4">
          <div className="text-xs font-semibold tracking-[0.18em] text-muted mb-3">FEATURES</div>
          <div className="flex flex-wrap gap-2">
            {vehicle.features.map((f: string, i: number) => (
              <span key={i} className="inline-flex items-center rounded-full border border-border-subtle bg-surface-hover px-3 py-1 text-xs text-secondary">
                {f}
              </span>
            ))}
          </div>
        </section>
      )}

      {/* Inquiry Form */}
      {vehicle.status === "listed" && (
        <InquiryForm vehicleId={vehicle.id} vehicleLabel={`${vehicle.maker} ${vehicle.model}`} />
      )}
    </main>
  );
}
