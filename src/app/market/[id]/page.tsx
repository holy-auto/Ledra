"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Badge from "@/components/ui/Badge";
import { formatJpy, formatDate } from "@/lib/format";

type VehicleImage = { id: string; storage_path: string; file_name: string | null; sort_order: number };

type Vehicle = {
  id: string;
  maker: string;
  model: string;
  grade: string | null;
  year: number | null;
  mileage: number | null;
  color: string | null;
  color_code: string | null;
  plate_number: string | null;
  chassis_number: string | null;
  engine_type: string | null;
  displacement: number | null;
  transmission: string | null;
  drive_type: string | null;
  fuel_type: string | null;
  door_count: number | null;
  seating_capacity: number | null;
  body_type: string | null;
  inspection_date: string | null;
  repair_history: string | null;
  condition_grade: string | null;
  condition_note: string | null;
  asking_price: number | null;
  wholesale_price: number | null;
  status: string;
  listed_at: string | null;
  description: string | null;
  features: string[] | null;
  images?: VehicleImage[];
  tenant_name?: string;
};

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

export default function MarketVehicleDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [loading, setLoading] = useState(true);
  const [mainImage, setMainImage] = useState(0);

  const fetchVehicle = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/market-vehicles?id=${id}&public=true`, { cache: "no-store" });
      const j = await res.json().catch(() => null);
      if (res.ok && j?.vehicles?.length > 0) {
        setVehicle(j.vehicles[0]);
      }
    } catch {}
  }, [id]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await fetchVehicle();
      setLoading(false);
    })();
  }, [fetchVehicle]);

  if (loading) return <main className="p-10 text-sm text-muted">読み込み中…</main>;
  if (!vehicle) {
    return (
      <main className="mx-auto max-w-4xl px-6 py-10">
        <div className="glass-card p-8 text-center">
          <p className="text-primary font-medium">車両が見つかりません</p>
          <Link href="/market" className="mt-4 inline-block text-sm text-[#0071e3] hover:underline">一覧に戻る</Link>
        </div>
      </main>
    );
  }

  const images = vehicle.images ?? [];

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
        <Link href="/market" className="text-sm text-[#0071e3] hover:underline">← 在庫一覧に戻る</Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Images */}
        <div className="space-y-3">
          {/* Main image */}
          <div className="aspect-[4/3] glass-card overflow-hidden flex items-center justify-center bg-neutral-100">
            {images.length > 0 ? (
              <img
                src={images[mainImage]?.storage_path}
                alt={`${vehicle.maker} ${vehicle.model}`}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="text-muted text-sm">写真なし</div>
            )}
          </div>
          {/* Thumbnails */}
          {images.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-2">
              {images.map((img, idx) => (
                <button
                  key={img.id}
                  type="button"
                  onClick={() => setMainImage(idx)}
                  className={`flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 transition-colors ${
                    idx === mainImage ? "border-[#0071e3]" : "border-transparent"
                  }`}
                >
                  <img src={img.storage_path} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

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
            {vehicle.features.map((f, i) => (
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

function InquiryForm({ vehicleId, vehicleLabel }: { vehicleId: string; vehicleLabel: string }) {
  const [form, setForm] = useState({ buyer_name: "", buyer_company: "", buyer_email: "", buyer_phone: "", message: "" });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/market/inquiries", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ vehicle_id: vehicleId, ...form }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error ?? `送信に失敗しました (${res.status})`);
      setResult({ ok: true, text: "お問い合わせを送信しました。担当者より連絡いたします。" });
      setForm({ buyer_name: "", buyer_company: "", buyer_email: "", buyer_phone: "", message: "" });
    } catch (e: any) {
      setResult({ ok: false, text: e?.message ?? String(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="glass-card p-5 mt-6">
      <div className="text-xs font-semibold tracking-[0.18em] text-muted mb-2">INQUIRY</div>
      <h3 className="text-lg font-bold text-primary mb-4">この車両について問い合わせる</h3>
      <p className="text-sm text-muted mb-4">「{vehicleLabel}」に関するお問い合わせ</p>

      {result && (
        <div className={`mb-4 text-sm ${result.ok ? "text-emerald-600" : "text-red-500"}`}>
          {result.text}
        </div>
      )}

      {(!result?.ok) && (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="block space-y-1">
              <span className="text-sm font-medium text-secondary">お名前 <span className="text-red-500">*</span></span>
              <input
                type="text"
                required
                value={form.buyer_name}
                onChange={(e) => setForm((p) => ({ ...p, buyer_name: e.target.value }))}
                className="input-field"
                placeholder="山田 太郎"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-sm font-medium text-secondary">会社名</span>
              <input
                type="text"
                value={form.buyer_company}
                onChange={(e) => setForm((p) => ({ ...p, buyer_company: e.target.value }))}
                className="input-field"
                placeholder="株式会社○○"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-sm font-medium text-secondary">メールアドレス <span className="text-red-500">*</span></span>
              <input
                type="email"
                required
                value={form.buyer_email}
                onChange={(e) => setForm((p) => ({ ...p, buyer_email: e.target.value }))}
                className="input-field"
                placeholder="info@example.com"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-sm font-medium text-secondary">電話番号</span>
              <input
                type="tel"
                value={form.buyer_phone}
                onChange={(e) => setForm((p) => ({ ...p, buyer_phone: e.target.value }))}
                className="input-field"
                placeholder="03-0000-0000"
              />
            </label>
          </div>
          <label className="block space-y-1">
            <span className="text-sm font-medium text-secondary">メッセージ <span className="text-red-500">*</span></span>
            <textarea
              required
              rows={4}
              value={form.message}
              onChange={(e) => setForm((p) => ({ ...p, message: e.target.value }))}
              className="input-field"
              placeholder="ご質問やご要望をお書きください"
            />
          </label>
          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? "送信中…" : "問い合わせを送信"}
          </button>
        </form>
      )}
    </section>
  );
}
