"use client";

import { useState, useEffect, useCallback } from "react";
import Modal from "@/components/ui/Modal";
import { formatDateTime, formatJpy } from "@/lib/format";
import type { SquareOrder } from "@/types/square";

type Customer = {
  id: string;
  name: string;
};

type Vehicle = {
  id: string;
  maker: string | null;
  model: string | null;
  year: number | null;
  plate_display: string | null;
  customer_id: string | null;
};

type Certificate = {
  id: string;
  public_id: string;
  status: string;
};

type Props = {
  order: SquareOrder;
  onClose: () => void;
  onSave: (linked: any) => void;
};

export default function SquareLinkModal({ order, onClose, onSave }: Props) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [certificates, setCertificates] = useState<Certificate[]>([]);

  const [customerId, setCustomerId] = useState(order.customer_id ?? "");
  const [vehicleId, setVehicleId] = useState(order.vehicle_id ?? "");
  const [certificateId, setCertificateId] = useState(order.certificate_id ?? "");
  const [note, setNote] = useState(order.note ?? "");

  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [customerSearch, setCustomerSearch] = useState("");

  // Fetch customers
  const fetchCustomers = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (customerSearch) params.set("q", customerSearch);
      params.set("per_page", "100");
      const res = await fetch(`/api/admin/customers?${params.toString()}`);
      const j = await res.json().catch(() => null);
      if (res.ok && j?.customers) {
        setCustomers(j.customers.map((c: any) => ({ id: c.id, name: c.name })));
      }
    } catch {}
  }, [customerSearch]);

  // Fetch vehicles filtered by customer
  const fetchVehicles = useCallback(async (custId: string) => {
    if (!custId) {
      setVehicles([]);
      return;
    }
    try {
      const res = await fetch(`/api/admin/vehicles?customer_id=${encodeURIComponent(custId)}`);
      const j = await res.json().catch(() => null);
      if (res.ok && j?.vehicles) {
        setVehicles(
          j.vehicles.map((v: any) => ({
            id: v.id,
            maker: v.maker,
            model: v.model,
            year: v.year,
            plate_display: v.plate_display,
            customer_id: v.customer_id ?? null,
          })),
        );
      }
    } catch {
      setVehicles([]);
    }
  }, []);

  // Fetch certificates filtered by vehicle
  const fetchCertificates = useCallback(async (vehId: string) => {
    if (!vehId) {
      setCertificates([]);
      return;
    }
    try {
      const res = await fetch(
        `/api/admin/certificates?vehicle_id=${encodeURIComponent(vehId)}&per_page=100`,
      );
      const j = await res.json().catch(() => null);
      if (res.ok && j?.certificates) {
        setCertificates(
          j.certificates.map((c: any) => ({
            id: c.id,
            public_id: c.public_id,
            status: c.status,
          })),
        );
      }
    } catch {
      setCertificates([]);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  useEffect(() => {
    if (customerId) fetchVehicles(customerId);
  }, [customerId, fetchVehicles]);

  useEffect(() => {
    if (vehicleId) fetchCertificates(vehicleId);
  }, [vehicleId, fetchCertificates]);

  const handleCustomerChange = (val: string) => {
    setCustomerId(val);
    setVehicleId("");
    setCertificateId("");
    setVehicles([]);
    setCertificates([]);
  };

  const handleVehicleChange = (val: string) => {
    setVehicleId(val);
    setCertificateId("");
    setCertificates([]);
  };

  const handleSave = async () => {
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch(`/api/admin/square/orders/${order.id}/link`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          customer_id: customerId || null,
          vehicle_id: vehicleId || null,
          certificate_id: certificateId || null,
          note: note || null,
        }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.message ?? j?.error ?? `HTTP ${res.status}`);
      onSave(j);
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setSaving(false);
    }
  };

  // Items summary
  const itemsSummary =
    order.items_json && order.items_json.length > 0
      ? order.items_json
          .map((item: any) => item.name || item.description || "不明")
          .join(", ")
      : "品目情報なし";

  const vehicleLabel = (v: Vehicle) => {
    const parts = [v.maker, v.model, v.year ? String(v.year) : null].filter(Boolean).join(" ");
    return (parts || "（名称なし）") + (v.plate_display ? ` (${v.plate_display})` : "");
  };

  return (
    <Modal
      open={true}
      onClose={onClose}
      title="Square売上 紐付け"
      footer={
        <>
          <button
            type="button"
            className="btn-ghost"
            onClick={onClose}
          >
            キャンセル
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={saving}
            onClick={handleSave}
          >
            {saving ? "保存中…" : "保存"}
          </button>
        </>
      }
    >
      {/* Order info */}
      <div className="rounded-lg bg-surface-hover p-3 space-y-1">
        <div className="flex justify-between text-sm">
          <span className="text-muted">金額</span>
          <span className="font-medium text-primary">{formatJpy(order.total_amount)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted">日時</span>
          <span className="text-secondary">{formatDateTime(order.square_created_at)}</span>
        </div>
        <div className="text-xs text-muted">{itemsSummary}</div>
      </div>

      {/* Customer */}
      <div className="space-y-1">
        <label className="text-xs text-muted">顧客</label>
        <input
          type="text"
          className="input-field mb-1"
          placeholder="顧客名で検索…"
          value={customerSearch}
          onChange={(e) => setCustomerSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") fetchCustomers();
          }}
        />
        <select
          className="input-field"
          value={customerId}
          onChange={(e) => handleCustomerChange(e.target.value)}
        >
          <option value="">選択なし</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {/* Vehicle */}
      <div className="space-y-1">
        <label className="text-xs text-muted">車両</label>
        <select
          className="input-field"
          value={vehicleId}
          onChange={(e) => handleVehicleChange(e.target.value)}
          disabled={!customerId}
        >
          <option value="">選択なし</option>
          {vehicles.map((v) => (
            <option key={v.id} value={v.id}>
              {vehicleLabel(v)}
            </option>
          ))}
        </select>
        {customerId && vehicles.length === 0 && (
          <div className="text-[10px] text-muted">この顧客に紐付く車両がありません</div>
        )}
      </div>

      {/* Certificate */}
      <div className="space-y-1">
        <label className="text-xs text-muted">証明書（任意）</label>
        <select
          className="input-field"
          value={certificateId}
          onChange={(e) => setCertificateId(e.target.value)}
          disabled={!vehicleId}
        >
          <option value="">選択なし</option>
          {certificates.map((c) => (
            <option key={c.id} value={c.id}>
              {c.public_id} ({c.status === "active" ? "有効" : c.status})
            </option>
          ))}
        </select>
        {vehicleId && certificates.length === 0 && (
          <div className="text-[10px] text-muted">この車両に紐付く証明書がありません</div>
        )}
      </div>

      {/* Note */}
      <div className="space-y-1">
        <label className="text-xs text-muted">備考</label>
        <textarea
          className="input-field"
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="メモを入力…"
        />
      </div>

      {/* Error */}
      {err && (
        <div className="rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-400">
          {err}
        </div>
      )}
    </Modal>
  );
}
