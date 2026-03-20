"use client";

import { useState, useId, useEffect, useRef } from "react";
import Button from "@/components/ui/Button";

type Vehicle = {
  id: string;
  maker: string | null;
  model: string | null;
  year: number | null;
  plate_display: string | null;
  vin_code?: string | null;
  customer_id?: string | null;
  customer?: { id: string; name: string } | null;
};

type Customer = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
};

function vehicleLabel(v: Vehicle) {
  const parts: string[] = [];
  if (v.maker) parts.push(v.maker);
  if (v.model) parts.push(v.model);
  if (v.year) parts.push(String(v.year));
  const info = parts.join(" ");
  if (v.plate_display) return `${info}（${v.plate_display}）`;
  return info || "（名称なし）";
}

function vehicleModel(v: Vehicle) {
  return [v.maker, v.model, v.year ? String(v.year) : null]
    .filter(Boolean)
    .join(" ");
}

const inputCls =
  "w-full rounded-xl border border-neutral-300 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400";
const labelCls = "block space-y-1.5";
const labelTextCls = "text-sm font-medium text-neutral-700";

export default function VehiclePickerSection({
  vehicles: initialVehicles,
  defaultVehicleId,
}: {
  vehicles: Vehicle[];
  defaultVehicleId?: string;
}) {
  const uid = useId();
  const [vehicles, setVehicles] = useState<Vehicle[]>(initialVehicles);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [model, setModel] = useState("");
  const [plate, setPlate] = useState("");

  // Customer master search
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerResults, setCustomerResults] = useState<Customer[]>([]);
  const [customerSearchOpen, setCustomerSearchOpen] = useState(false);
  const customerDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Inline new vehicle form
  const [showNewVehicleForm, setShowNewVehicleForm] = useState(false);
  const [newMaker, setNewMaker] = useState("");
  const [newModel, setNewModel] = useState("");
  const [newYear, setNewYear] = useState("");
  const [newPlate, setNewPlate] = useState("");
  const [newVin, setNewVin] = useState("");
  const [newVehicleBusy, setNewVehicleBusy] = useState(false);
  const [newVehicleErr, setNewVehicleErr] = useState<string | null>(null);

  // Pre-select vehicle when defaultVehicleId is provided
  useEffect(() => {
    if (!defaultVehicleId) return;
    const v = vehicles.find((v) => v.id === defaultVehicleId);
    if (v) {
      setSelectedId(v.id);
      setModel(vehicleModel(v));
      setPlate(v.plate_display ?? "");
      if (v.customer) {
        setCustomerName(v.customer.name);
        setCustomerId(v.customer.id);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultVehicleId]);

  // Customer search debounce
  useEffect(() => {
    if (!customerSearch.trim()) {
      setCustomerResults([]);
      return;
    }
    if (customerDebounceRef.current) clearTimeout(customerDebounceRef.current);
    customerDebounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/customers?q=${encodeURIComponent(customerSearch)}&limit=8`);
        const j = await res.json();
        setCustomerResults(j.customers ?? []);
      } catch {
        setCustomerResults([]);
      }
    }, 300);
  }, [customerSearch]);

  const filtered = vehicles.filter((v) => {
    if (!search.trim()) return true;
    const s = search.toLowerCase();
    return [v.maker, v.model, v.plate_display, v.vin_code]
      .filter(Boolean)
      .some((val) => String(val).toLowerCase().includes(s));
  });

  const handleSelect = (vehicleId: string, vehicleList = vehicles) => {
    setSelectedId(vehicleId);
    setSearch("");
    setShowNewVehicleForm(false);
    const v = vehicleList.find((v) => v.id === vehicleId);
    if (v) {
      setModel(vehicleModel(v));
      setPlate(v.plate_display ?? "");
      // 車両に顧客が紐付いている場合は自動入力
      if (v.customer) {
        setCustomerName(v.customer.name);
        setCustomerId(v.customer.id);
        setCustomerSearch("");
      }
    }
  };

  const handleClear = () => {
    setSelectedId("");
    setSearch("");
    setModel("");
    setPlate("");
    setShowNewVehicleForm(false);
  };

  const handleCustomerSelect = (c: Customer) => {
    setCustomerName(c.name);
    setCustomerId(c.id);
    setCustomerSearch("");
    setCustomerSearchOpen(false);
  };

  async function createNewVehicle(e: React.FormEvent) {
    e.preventDefault();
    setNewVehicleBusy(true);
    setNewVehicleErr(null);
    try {
      const res = await fetch("/api/vehicles/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          maker: newMaker,
          model: newModel,
          year: newYear ? Number(newYear) : null,
          plate_display: newPlate || null,
          vin_code: newVin || null,
          customer_id: customerId || null,
        }),
      });
      const j = await res.json();
      if (!res.ok) {
        setNewVehicleErr(j?.message || "登録に失敗しました。");
        return;
      }
      const newV: Vehicle = {
        id: j.id,
        maker: newMaker,
        model: newModel,
        year: newYear ? Number(newYear) : null,
        plate_display: newPlate || null,
        vin_code: newVin || null,
      };
      const updated = [...vehicles, newV];
      setVehicles(updated);
      handleSelect(j.id, updated);
      // Reset form
      setNewMaker(""); setNewModel(""); setNewYear(""); setNewPlate(""); setNewVin("");
      setSearch("");
    } catch (err: any) {
      setNewVehicleErr(String(err?.message || err));
    } finally {
      setNewVehicleBusy(false);
    }
  }

  const selected = vehicles.find((v) => v.id === selectedId) ?? null;

  return (
    <div className="space-y-4">
      {/* Vehicle picker */}
      <div>
        <div className="mb-4">
          <div className="text-xs font-semibold tracking-[0.18em] text-neutral-500">
            VEHICLE LINK
          </div>
          <div className="mt-1 text-base font-semibold text-neutral-900">
            車両を選択 <span className="text-red-500">*</span>
          </div>
          <p className="mt-0.5 text-xs text-neutral-500">
            登録済みの車両から選択してください（必須）
          </p>
        </div>

        <input type="hidden" name="vehicle_id" value={selectedId} />

        {selected ? (
          <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5">
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-emerald-900 truncate">
                {vehicleLabel(selected)}
              </div>
              {selected.customer && (
                <div className="text-xs text-emerald-700 mt-0.5">
                  顧客: {selected.customer.name}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={handleClear}
              className="shrink-0 rounded-lg border border-emerald-300 bg-white px-3 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
            >
              解除
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="relative">
              <input
                id={uid}
                type="text"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setShowNewVehicleForm(false); }}
                placeholder={
                  vehicles.length === 0
                    ? "登録車両がありません"
                    : "車種・ナンバー・VINで検索…"
                }
                disabled={vehicles.length === 0}
                autoComplete="off"
                className={`${inputCls} pr-10 disabled:bg-neutral-100 disabled:text-neutral-500`}
              />
              {search && filtered.length > 0 && (
                <ul className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-neutral-200 bg-white shadow-md">
                  {filtered.map((v) => (
                    <li key={v.id}>
                      <button
                        type="button"
                        onMouseDown={() => handleSelect(v.id)}
                        className="w-full px-4 py-2.5 text-left text-sm hover:bg-neutral-50"
                      >
                        <span className="font-medium text-neutral-900">
                          {vehicleLabel(v)}
                        </span>
                        {v.vin_code && (
                          <span className="ml-2 text-xs text-neutral-400 font-mono">
                            {v.vin_code}
                          </span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* No match — show new vehicle option */}
            {search && filtered.length === 0 && !showNewVehicleForm && (
              <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3 flex items-center justify-between gap-3">
                <span className="text-sm text-neutral-500">一致する車両が見つかりません</span>
                <button
                  type="button"
                  onClick={() => setShowNewVehicleForm(true)}
                  className="shrink-0 rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-100"
                >
                  新規登録して選択
                </button>
              </div>
            )}

            {/* Inline new vehicle form */}
            {showNewVehicleForm && (
              <form onSubmit={createNewVehicle} className="rounded-xl border border-neutral-200 bg-neutral-50 p-4 space-y-3">
                <div className="text-xs font-semibold text-neutral-700">新規車両を登録</div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <input value={newMaker} onChange={(e) => setNewMaker(e.target.value)} placeholder="メーカー *" required className={inputCls} />
                  <input value={newModel} onChange={(e) => setNewModel(e.target.value)} placeholder="車種 *" required className={inputCls} />
                  <input value={newYear} onChange={(e) => setNewYear(e.target.value)} placeholder="年式" inputMode="numeric" className={inputCls} />
                  <input value={newPlate} onChange={(e) => setNewPlate(e.target.value)} placeholder="ナンバー" className={inputCls} />
                  <input value={newVin} onChange={(e) => setNewVin(e.target.value)} placeholder="車体番号（VIN）" className={`${inputCls} font-mono sm:col-span-2`} />
                </div>
                {newVehicleErr && <p className="text-xs text-red-500">{newVehicleErr}</p>}
                <div className="flex gap-2">
                  <Button type="submit" size="sm" loading={newVehicleBusy}>登録して選択</Button>
                  <button type="button" onClick={() => setShowNewVehicleForm(false)} className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs text-neutral-600 hover:bg-neutral-100">キャンセル</button>
                </div>
              </form>
            )}
          </div>
        )}
      </div>

      {/* Basic info */}
      <div className="border-t border-neutral-100 pt-4">
        <div className="mb-4">
          <div className="text-xs font-semibold tracking-[0.18em] text-neutral-500">
            BASIC INFO
          </div>
          <div className="mt-1 text-base font-semibold text-neutral-900">
            基本情報
          </div>
        </div>

        <div className="space-y-4">
          {/* Customer name — combobox: type to search or manual entry */}
          <div className={labelCls}>
            <span className={labelTextCls}>
              お客様名 <span className="text-red-500">*</span>
            </span>
            <div className="relative">
              <input type="hidden" name="customer_id" value={customerId} />
              <input
                name="customer_name"
                value={customerName}
                onChange={(e) => {
                  const val = e.target.value;
                  setCustomerName(val);
                  setCustomerId("");
                  setCustomerSearch(val);
                  setCustomerSearchOpen(true);
                }}
                onFocus={() => {
                  if (customerName) {
                    setCustomerSearch(customerName);
                  }
                  setCustomerSearchOpen(true);
                }}
                onBlur={() => setTimeout(() => setCustomerSearchOpen(false), 200)}
                className={inputCls}
                placeholder="顧客名を入力 or 顧客マスタから選択"
                required
                autoComplete="off"
              />
              {customerId && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded font-medium">
                  マスタ連携
                </span>
              )}
              {customerSearchOpen && customerResults.length > 0 && (
                <ul className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-xl border border-neutral-200 bg-white shadow-md">
                  {customerResults.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        onMouseDown={() => handleCustomerSelect(c)}
                        className="w-full px-4 py-2.5 text-left text-sm hover:bg-neutral-50"
                      >
                        <span className="font-medium text-neutral-900">{c.name}</span>
                        {c.phone && <span className="ml-2 text-xs text-neutral-500">{c.phone}</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-1 text-[11px] text-neutral-400">入力すると顧客マスタを検索します。手入力のみでもOK</p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className={labelCls}>
              <span className={labelTextCls}>車種</span>
              <input
                name="model"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className={inputCls}
                placeholder="Toyota Prius"
              />
            </label>
            <label className={labelCls}>
              <span className={labelTextCls}>ナンバー</span>
              <input
                name="plate"
                value={plate}
                onChange={(e) => setPlate(e.target.value)}
                className={inputCls}
                placeholder="水戸 300 あ 12-34"
              />
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}
