"use client";

import { useState, useId, useEffect, useRef, useMemo } from "react";
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
  return [v.maker, v.model, v.year ? String(v.year) : null].filter(Boolean).join(" ");
}

const inputCls =
  "w-full rounded-xl border border-border-default bg-surface px-3 py-2.5 text-sm text-primary placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent";
const labelCls = "block space-y-1.5";
const labelTextCls = "text-sm font-medium text-secondary";

export default function VehiclePickerSection({
  vehicles: initialVehicles,
  defaultVehicleId,
  onVehicleChange,
}: {
  vehicles: Vehicle[];
  defaultVehicleId?: string;
  onVehicleChange?: (vehicleId: string | undefined) => void;
}) {
  const uid = useId();
  const [vehicles, setVehicles] = useState<Vehicle[]>(initialVehicles);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [model, setModel] = useState("");
  const [plate, setPlate] = useState("");
  const [maker, setMaker] = useState("");

  // Customer master search
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerResults, setCustomerResults] = useState<Customer[]>([]);
  const [customerSearchOpen, setCustomerSearchOpen] = useState(false);
  const customerDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Vehicle search (combobox for maker field)
  const [vehicleSearchOpen, setVehicleSearchOpen] = useState(false);
  const vehicleDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Pre-select vehicle when defaultVehicleId is provided
  useEffect(() => {
    if (!defaultVehicleId) return;
    const v = vehicles.find((v) => v.id === defaultVehicleId);
    if (v) {
      setSelectedId(v.id);
      setMaker(v.maker ?? "");
      setModel(vehicleModel(v));
      setPlate(v.plate_display ?? "");
      if (v.customer) {
        setCustomerName(v.customer.name);
        setCustomerId(v.customer.id);
      }
      onVehicleChange?.(v.id);
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

  // Vehicle search — filter local list based on maker input.
  // Memoize so we don't re-iterate ~300 vehicles on every unrelated re-render
  // (this used to dominate INP while typing in other fields). Cap the visible
  // dropdown to avoid rendering hundreds of <li> nodes per keystroke.
  const VEHICLE_DROPDOWN_LIMIT = 50;
  const vehicleFiltered = useMemo(() => {
    const s = maker.trim().toLowerCase();
    if (!s) return vehicles.slice(0, VEHICLE_DROPDOWN_LIMIT);
    const matched: Vehicle[] = [];
    for (const v of vehicles) {
      const hit = [v.maker, v.model, v.plate_display, v.vin_code]
        .filter(Boolean)
        .some((val) => String(val).toLowerCase().includes(s));
      if (hit) {
        matched.push(v);
        if (matched.length >= VEHICLE_DROPDOWN_LIMIT) break;
      }
    }
    return matched;
  }, [vehicles, maker]);

  const handleVehicleSelect = (v: Vehicle) => {
    setSelectedId(v.id);
    setMaker(v.maker ?? "");
    setModel(vehicleModel(v));
    setPlate(v.plate_display ?? "");
    setVehicleSearchOpen(false);
    onVehicleChange?.(v.id);
    // Auto-fill customer if vehicle has one
    if (v.customer) {
      setCustomerName(v.customer.name);
      setCustomerId(v.customer.id);
      setCustomerSearch("");
    }
  };

  const handleVehicleClear = () => {
    setSelectedId("");
    setMaker("");
    onVehicleChange?.(undefined);
    setModel("");
    setPlate("");
  };

  const handleMakerChange = (val: string) => {
    setMaker(val);
    // Clear master link when user types freely
    if (selectedId) {
      setSelectedId("");
    }
    setVehicleSearchOpen(true);
  };

  const handleModelChange = (val: string) => {
    setModel(val);
    if (selectedId) {
      setSelectedId("");
    }
  };

  const handlePlateChange = (val: string) => {
    setPlate(val);
    if (selectedId) {
      setSelectedId("");
    }
  };

  const handleCustomerSelect = (c: Customer) => {
    setCustomerName(c.name);
    setCustomerId(c.id);
    setCustomerSearch("");
    setCustomerSearchOpen(false);
  };

  return (
    <div className="space-y-4">
      {/* Vehicle info section */}
      <div>
        <div className="mb-4">
          <div className="text-xs font-semibold tracking-[0.18em] text-muted">VEHICLE INFO</div>
          <div className="mt-1 text-base font-semibold text-primary">車両情報</div>
          <p className="mt-0.5 text-xs text-muted">車両マスタから選択、または手入力してください</p>
        </div>

        <input type="hidden" name="vehicle_id" value={selectedId} />
        <input type="hidden" name="vehicle_maker" value={maker} />

        <div className="space-y-4">
          {/* Maker — combobox: type to search or manual entry */}
          <div className={labelCls}>
            <span className={labelTextCls}>
              メーカー <span className="text-red-500">*</span>
            </span>
            <div className="relative">
              <input
                name="maker_display"
                value={maker}
                onChange={(e) => handleMakerChange(e.target.value)}
                onFocus={() => setVehicleSearchOpen(true)}
                onBlur={() => setTimeout(() => setVehicleSearchOpen(false), 200)}
                className={inputCls}
                placeholder="メーカーを入力 or 車両マスタから選択"
                autoComplete="off"
              />
              {selectedId && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded font-medium">
                  マスタ連携
                </span>
              )}
              {vehicleSearchOpen && !selectedId && vehicleFiltered.length > 0 && (
                <ul className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-border-default bg-surface shadow-md">
                  {vehicleFiltered.map((v) => (
                    <li key={v.id}>
                      <button
                        type="button"
                        onMouseDown={() => handleVehicleSelect(v)}
                        className="w-full px-4 py-2.5 text-left text-sm hover:bg-surface-hover"
                      >
                        <span className="font-medium text-primary">{vehicleLabel(v)}</span>
                        {v.customer && <span className="ml-2 text-xs text-emerald-600">{v.customer.name}</span>}
                        {v.vin_code && <span className="ml-2 text-xs text-neutral-400 font-mono">{v.vin_code}</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-1 text-[11px] text-muted">入力すると車両マスタを検索します。手入力のみでもOK</p>
            </div>
          </div>

          {/* Selected vehicle banner (when linked to master) */}
          {selectedId && (
            <div className="flex items-center gap-3 rounded-xl border border-emerald-200/50 bg-emerald-500/10 px-4 py-2.5">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-emerald-600 truncate">
                  {vehicleLabel(vehicles.find((v) => v.id === selectedId)!)}
                </div>
              </div>
              <button
                type="button"
                onClick={handleVehicleClear}
                className="shrink-0 rounded-lg border border-emerald-300/50 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-600 hover:bg-emerald-500/20"
              >
                マスタ連携を解除
              </button>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <label className={labelCls}>
              <span className={labelTextCls}>車種</span>
              <input
                name="model"
                value={model}
                onChange={(e) => handleModelChange(e.target.value)}
                className={inputCls}
                placeholder="Toyota Prius"
              />
            </label>
            <label className={labelCls}>
              <span className={labelTextCls}>ナンバー</span>
              <input
                name="plate"
                value={plate}
                onChange={(e) => handlePlateChange(e.target.value)}
                className={inputCls}
                placeholder="水戸 300 あ 12-34"
              />
            </label>
          </div>
        </div>
      </div>

      {/* Basic info — customer */}
      <div className="border-t border-border-subtle pt-4">
        <div className="mb-4">
          <div className="text-xs font-semibold tracking-[0.18em] text-muted">BASIC INFO</div>
          <div className="mt-1 text-base font-semibold text-primary">基本情報</div>
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
                <ul className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-xl border border-border-default bg-surface shadow-md">
                  {customerResults.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        onMouseDown={() => handleCustomerSelect(c)}
                        className="w-full px-4 py-2.5 text-left text-sm hover:bg-surface-hover"
                      >
                        <span className="font-medium text-primary">{c.name}</span>
                        {c.phone && <span className="ml-2 text-xs text-muted">{c.phone}</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-1 text-[11px] text-muted">入力すると顧客マスタを検索します。手入力のみでもOK</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
