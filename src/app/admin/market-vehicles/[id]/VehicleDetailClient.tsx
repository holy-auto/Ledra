"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
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
  created_at: string;
  updated_at: string | null;
};

const STATUS_LABELS: Record<string, string> = {
  draft: "下書き", listed: "出品中", reserved: "商談中", sold: "成約済", withdrawn: "取下げ",
};
const STATUS_VARIANTS: Record<string, "default" | "success" | "warning" | "info" | "danger"> = {
  draft: "default", listed: "success", reserved: "warning", sold: "info", withdrawn: "danger",
};
const TRANSITIONS: Record<string, string[]> = {
  draft: ["listed"],
  listed: ["reserved", "sold", "withdrawn"],
  reserved: ["listed", "sold", "withdrawn"],
  withdrawn: ["listed"],
};

const TRANSMISSIONS = ["AT", "MT", "CVT"];
const DRIVE_TYPES = ["FF", "FR", "4WD", "AWD"];
const FUEL_TYPES = ["ガソリン", "ディーゼル", "ハイブリッド", "EV"];
const BODY_TYPES = ["セダン", "SUV", "ミニバン", "軽", "クーペ", "ワゴン", "トラック", "その他"];
const REPAIR_OPTIONS = ["なし", "あり", "不明"];
const CONDITION_GRADES = ["S", "A", "B", "C", "D"];

export default function VehicleDetailClient({ vehicleId }: { vehicleId: string }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [images, setImages] = useState<VehicleImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [mainIdx, setMainIdx] = useState(0);
  const [updating, setUpdating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editData, setEditData] = useState<Record<string, unknown>>({});

  const fetchVehicle = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/market-vehicles?id=${vehicleId}`, { cache: "no-store" });
      const j = await res.json().catch(() => null);
      if (res.ok && j?.vehicles?.length > 0) {
        setVehicle(j.vehicles[0]);
        setImages(j.vehicles[0].images ?? []);
      }
    } catch {}
  }, [vehicleId]);

  useEffect(() => {
    (async () => { setLoading(true); await fetchVehicle(); setLoading(false); })();
  }, [fetchVehicle]);

  const handleStatusChange = async (newStatus: string) => {
    setUpdating(true); setMsg(null);
    try {
      const res = await fetch("/api/admin/market-vehicles", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: vehicleId, status: newStatus }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error ?? `HTTP ${res.status}`);
      setVehicle(j.vehicle);
      setMsg({ text: `ステータスを「${STATUS_LABELS[newStatus] ?? newStatus}」に変更しました`, ok: true });
    } catch (e: any) {
      setMsg({ text: e?.message ?? String(e), ok: false });
    } finally { setUpdating(false); }
  };

  const handleSave = async () => {
    setUpdating(true); setMsg(null);
    try {
      const payload: Record<string, unknown> = { ...editData, id: vehicleId };
      // Convert features string to array
      if (typeof payload.features === "string") {
        payload.features = (payload.features as string).split(",").map((s: string) => s.trim()).filter(Boolean);
      }
      const res = await fetch("/api/admin/market-vehicles", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error ?? `HTTP ${res.status}`);
      setVehicle(j.vehicle);
      setEditMode(false);
      setMsg({ text: "保存しました", ok: true });
    } catch (e: any) {
      setMsg({ text: e?.message ?? String(e), ok: false });
    } finally { setUpdating(false); }
  };

  const startEdit = () => {
    if (!vehicle) return;
    setEditData({
      maker: vehicle.maker, model: vehicle.model, grade: vehicle.grade,
      year: vehicle.year, mileage: vehicle.mileage, color: vehicle.color,
      color_code: vehicle.color_code, plate_number: vehicle.plate_number,
      chassis_number: vehicle.chassis_number, engine_type: vehicle.engine_type,
      displacement: vehicle.displacement, transmission: vehicle.transmission,
      drive_type: vehicle.drive_type, fuel_type: vehicle.fuel_type,
      door_count: vehicle.door_count, seating_capacity: vehicle.seating_capacity,
      body_type: vehicle.body_type, inspection_date: vehicle.inspection_date,
      repair_history: vehicle.repair_history, condition_grade: vehicle.condition_grade,
      condition_note: vehicle.condition_note, asking_price: vehicle.asking_price,
      wholesale_price: vehicle.wholesale_price, description: vehicle.description,
      features: vehicle.features?.join(", ") ?? "",
    });
    setEditMode(true);
    setMsg(null);
  };

  const handleUpload = async (files: FileList) => {
    if (images.length >= 20) { setMsg({ text: "画像は最大20枚までです", ok: false }); return; }
    setUploading(true); setMsg(null);
    try {
      for (let i = 0; i < files.length && images.length + i < 20; i++) {
        const fd = new FormData();
        fd.append("file", files[i]);
        fd.append("vehicle_id", vehicleId);
        const res = await fetch("/api/admin/market-vehicles/images", { method: "POST", body: fd });
        const j = await res.json().catch(() => null);
        if (!res.ok) throw new Error(j?.error ?? "Upload failed");
      }
      await fetchVehicle();
      setMsg({ text: "画像をアップロードしました", ok: true });
    } catch (e: any) {
      setMsg({ text: e?.message ?? String(e), ok: false });
    } finally { setUploading(false); }
  };

  const handleDeleteImage = async (imageId: string) => {
    if (!confirm("この画像を削除しますか？")) return;
    try {
      const res = await fetch("/api/admin/market-vehicles/images", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: imageId, vehicle_id: vehicleId }),
      });
      if (!res.ok) throw new Error("Delete failed");
      await fetchVehicle();
      if (mainIdx >= images.length - 1) setMainIdx(Math.max(0, images.length - 2));
    } catch (e: any) {
      setMsg({ text: e?.message ?? String(e), ok: false });
    }
  };

  const handleDelete = async () => {
    if (!confirm("この車両を削除しますか？")) return;
    try {
      const res = await fetch("/api/admin/market-vehicles", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: vehicleId }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error ?? `HTTP ${res.status}`);
      window.location.href = "/admin/market-vehicles";
    } catch (e: any) {
      setMsg({ text: e?.message ?? String(e), ok: false });
    }
  };

  const setField = (key: string, val: unknown) => setEditData((d) => ({ ...d, [key]: val }));

  const EditField = ({ label, field, type = "text", options }: { label: string; field: string; type?: string; options?: string[] }) => {
    const val = editData[field] ?? "";
    if (type === "select" && options) {
      return (
        <div className="space-y-1">
          <label className="text-xs text-muted">{label}</label>
          <select className="select-field" value={String(val)} onChange={(e) => setField(field, e.target.value || null)}>
            <option value="">-</option>
            {options.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
      );
    }
    if (type === "textarea") {
      return (
        <div className="space-y-1">
          <label className="text-xs text-muted">{label}</label>
          <textarea className="input-field" rows={3} value={String(val)} onChange={(e) => setField(field, e.target.value || null)} />
        </div>
      );
    }
    return (
      <div className="space-y-1">
        <label className="text-xs text-muted">{label}</label>
        <input
          type={type}
          className="input-field"
          value={String(val)}
          onChange={(e) => setField(field, type === "number" ? (e.target.value ? parseInt(e.target.value, 10) : null) : (e.target.value || null))}
        />
      </div>
    );
  };

  if (loading) return <div className="text-sm text-muted p-6">読み込み中…</div>;
  if (!vehicle) {
    return (
      <div className="space-y-4">
        <div className="glass-card p-8 text-center"><p className="text-primary font-medium">車両が見つかりません</p></div>
        <Link href="/admin/market-vehicles" className="text-sm text-[#0071e3] hover:underline">一覧に戻る</Link>
      </div>
    );
  }

  const nextStatuses = TRANSITIONS[vehicle.status] ?? [];

  const SpecRow = ({ label, value }: { label: string; value: string | number | null | undefined }) => {
    if (value == null || value === "") return null;
    return (
      <div className="flex items-center justify-between py-2 border-b border-border-subtle text-sm">
        <span className="text-muted">{label}</span>
        <span className="text-primary font-medium">{value}</span>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        tag="VEHICLE DETAIL"
        title={`${vehicle.maker} ${vehicle.model}`}
        description={vehicle.grade ?? undefined}
        actions={
          <div className="flex items-center gap-2">
            {!editMode && <button type="button" className="btn-secondary" onClick={startEdit}>編集</button>}
            <Link href="/admin/market-vehicles" className="btn-ghost">← 一覧</Link>
          </div>
        }
      />

      {msg && <div className={`text-sm ${msg.ok ? "text-emerald-600" : "text-red-500"}`}>{msg.text}</div>}

      {/* Status */}
      <section className="glass-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted">ステータス:</span>
            <Badge variant={STATUS_VARIANTS[vehicle.status] ?? "default"}>{STATUS_LABELS[vehicle.status] ?? vehicle.status}</Badge>
            {vehicle.listed_at && <span className="text-xs text-muted">出品日: {formatDate(vehicle.listed_at)}</span>}
          </div>
          <div className="flex gap-2 flex-wrap">
            {nextStatuses.map((ns) => (
              <button key={ns} type="button" className={ns === "withdrawn" ? "btn-danger !text-xs" : "btn-secondary !text-xs"} disabled={updating} onClick={() => handleStatusChange(ns)}>
                {STATUS_LABELS[ns] ?? ns}に変更
              </button>
            ))}
            {vehicle.status === "draft" && <button type="button" className="btn-danger !text-xs" onClick={handleDelete}>削除</button>}
          </div>
        </div>
      </section>

      {editMode ? (
        <div className="space-y-6">
          <section className="glass-card p-5 space-y-4">
            <div className="text-xs font-semibold tracking-[0.18em] text-muted">基本情報</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <EditField label="メーカー" field="maker" />
              <EditField label="車名" field="model" />
              <EditField label="グレード" field="grade" />
              <EditField label="年式" field="year" type="number" />
              <EditField label="走行距離 (km)" field="mileage" type="number" />
              <EditField label="色" field="color" />
              <EditField label="カラーコード" field="color_code" />
              <EditField label="ナンバー" field="plate_number" />
              <EditField label="車台番号" field="chassis_number" />
            </div>
          </section>
          <section className="glass-card p-5 space-y-4">
            <div className="text-xs font-semibold tracking-[0.18em] text-muted">スペック</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <EditField label="エンジン型式" field="engine_type" />
              <EditField label="排気量 (cc)" field="displacement" type="number" />
              <EditField label="トランスミッション" field="transmission" type="select" options={TRANSMISSIONS} />
              <EditField label="駆動方式" field="drive_type" type="select" options={DRIVE_TYPES} />
              <EditField label="燃料" field="fuel_type" type="select" options={FUEL_TYPES} />
              <EditField label="ドア数" field="door_count" type="number" />
              <EditField label="定員" field="seating_capacity" type="number" />
              <EditField label="ボディタイプ" field="body_type" type="select" options={BODY_TYPES} />
            </div>
          </section>
          <section className="glass-card p-5 space-y-4">
            <div className="text-xs font-semibold tracking-[0.18em] text-muted">コンディション・価格</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <EditField label="車検満了日" field="inspection_date" type="date" />
              <EditField label="修復歴" field="repair_history" type="select" options={REPAIR_OPTIONS} />
              <EditField label="評価点" field="condition_grade" type="select" options={CONDITION_GRADES} />
              <EditField label="希望価格" field="asking_price" type="number" />
              <EditField label="卸価格" field="wholesale_price" type="number" />
            </div>
            <EditField label="コンディション備考" field="condition_note" type="textarea" />
          </section>
          <section className="glass-card p-5 space-y-4">
            <EditField label="説明" field="description" type="textarea" />
            <EditField label="装備・オプション（カンマ区切り）" field="features" />
          </section>
          <div className="flex gap-3">
            <button type="button" className="btn-primary" disabled={updating} onClick={handleSave}>{updating ? "保存中…" : "保存"}</button>
            <button type="button" className="btn-ghost" onClick={() => setEditMode(false)}>キャンセル</button>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Images */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-3">
              <div className="aspect-[4/3] glass-card overflow-hidden flex items-center justify-center bg-neutral-100">
                {images.length > 0 ? (
                  <img src={images[mainIdx]?.storage_path} alt={`${vehicle.maker} ${vehicle.model}`} className="w-full h-full object-cover" />
                ) : (
                  <div className="text-muted text-sm">写真なし</div>
                )}
              </div>
              {images.length > 0 && (
                <div className="flex gap-2 overflow-x-auto pb-2">
                  {images.map((img, idx) => (
                    <div key={img.id} className="relative flex-shrink-0">
                      <button type="button" onClick={() => setMainIdx(idx)} className={`w-16 h-16 rounded-lg overflow-hidden border-2 ${idx === mainIdx ? "border-[#0071e3]" : "border-transparent"}`}>
                        <img src={img.storage_path} alt="" className="w-full h-full object-cover" />
                      </button>
                      <button type="button" onClick={() => handleDeleteImage(img.id)} className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center hover:bg-red-600">×</button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-3">
                <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onChange={(e) => { if (e.target.files?.length) handleUpload(e.target.files); }} />
                <button type="button" className="btn-secondary !text-xs" disabled={uploading || images.length >= 20} onClick={() => fileInputRef.current?.click()}>
                  {uploading ? "アップロード中…" : `写真を追加（${images.length}/20）`}
                </button>
              </div>
            </div>

            {/* Price */}
            <div className="space-y-4">
              <div className="glass-card p-5 space-y-3">
                <div className="text-xs font-semibold tracking-[0.18em] text-muted">PRICE</div>
                {vehicle.asking_price != null && (
                  <div><div className="text-xs text-muted">希望価格（税抜）</div><div className="text-2xl font-bold text-primary">{formatJpy(vehicle.asking_price)}</div></div>
                )}
                {vehicle.wholesale_price != null && (
                  <div><div className="text-xs text-muted">卸価格</div><div className="text-lg font-semibold text-secondary">{formatJpy(vehicle.wholesale_price)}</div></div>
                )}
              </div>
              <div className="flex gap-2 text-sm text-secondary flex-wrap">
                {vehicle.year && <span className="glass-card px-3 py-1.5">{vehicle.year}年式</span>}
                {vehicle.mileage != null && <span className="glass-card px-3 py-1.5">{vehicle.mileage.toLocaleString()} km</span>}
                {vehicle.color && <span className="glass-card px-3 py-1.5">{vehicle.color}</span>}
                {vehicle.transmission && <span className="glass-card px-3 py-1.5">{vehicle.transmission}</span>}
                {vehicle.fuel_type && <span className="glass-card px-3 py-1.5">{vehicle.fuel_type}</span>}
              </div>
              {vehicle.features && vehicle.features.length > 0 && (
                <div className="glass-card p-4">
                  <div className="text-xs font-semibold tracking-[0.18em] text-muted mb-2">FEATURES</div>
                  <div className="flex flex-wrap gap-1.5">
                    {vehicle.features.map((f, i) => (
                      <span key={i} className="rounded-full border border-border-subtle bg-surface-hover px-2.5 py-0.5 text-xs text-secondary">{f}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Specs */}
          <section className="glass-card p-5">
            <div className="text-xs font-semibold tracking-[0.18em] text-muted mb-4">SPECIFICATIONS</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8">
              <div>
                <SpecRow label="メーカー" value={vehicle.maker} />
                <SpecRow label="車種" value={vehicle.model} />
                <SpecRow label="グレード" value={vehicle.grade} />
                <SpecRow label="年式" value={vehicle.year ? `${vehicle.year}年` : null} />
                <SpecRow label="走行距離" value={vehicle.mileage != null ? `${vehicle.mileage.toLocaleString()} km` : null} />
                <SpecRow label="色" value={vehicle.color} />
                <SpecRow label="ナンバー" value={vehicle.plate_number} />
                <SpecRow label="車台番号" value={vehicle.chassis_number} />
                <SpecRow label="車検満了日" value={vehicle.inspection_date ? formatDate(vehicle.inspection_date) : null} />
                <SpecRow label="修復歴" value={vehicle.repair_history} />
              </div>
              <div>
                <SpecRow label="ボディタイプ" value={vehicle.body_type} />
                <SpecRow label="排気量" value={vehicle.displacement ? `${vehicle.displacement.toLocaleString()} cc` : null} />
                <SpecRow label="トランスミッション" value={vehicle.transmission} />
                <SpecRow label="駆動方式" value={vehicle.drive_type} />
                <SpecRow label="燃料" value={vehicle.fuel_type} />
                <SpecRow label="ドア数" value={vehicle.door_count ? `${vehicle.door_count}ドア` : null} />
                <SpecRow label="定員" value={vehicle.seating_capacity ? `${vehicle.seating_capacity}名` : null} />
                <SpecRow label="エンジン型式" value={vehicle.engine_type} />
                <SpecRow label="カラーコード" value={vehicle.color_code} />
                <SpecRow label="評価点" value={vehicle.condition_grade} />
              </div>
            </div>
          </section>

          {vehicle.condition_note && (
            <section className="glass-card p-5">
              <div className="text-xs font-semibold tracking-[0.18em] text-muted mb-2">CONDITION NOTE</div>
              <p className="text-sm text-secondary whitespace-pre-wrap">{vehicle.condition_note}</p>
            </section>
          )}
          {vehicle.description && (
            <section className="glass-card p-5">
              <div className="text-xs font-semibold tracking-[0.18em] text-muted mb-2">DESCRIPTION</div>
              <p className="text-sm text-secondary whitespace-pre-wrap">{vehicle.description}</p>
            </section>
          )}

          <section className="glass-card p-5 text-xs text-muted space-y-1">
            <div>ID: <span className="font-mono">{vehicle.id}</span></div>
            <div>登録日: {formatDate(vehicle.created_at)}</div>
            {vehicle.updated_at && <div>更新日: {formatDate(vehicle.updated_at)}</div>}
          </section>
        </div>
      )}
    </div>
  );
}
