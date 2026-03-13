"use client";

import { useState, useId, useEffect } from "react";

type Vehicle = {
  id: string;
  maker: string | null;
  model: string | null;
  year: number | null;
  plate_display: string | null;
  customer_name: string | null;
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
  vehicles,
  defaultVehicleId,
}: {
  vehicles: Vehicle[];
  defaultVehicleId?: string;
}) {
  const uid = useId();
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [model, setModel] = useState("");
  const [plate, setPlate] = useState("");

  // Pre-select vehicle when defaultVehicleId is provided (e.g. from ?vehicle_id= in URL)
  useEffect(() => {
    if (!defaultVehicleId) return;
    const v = vehicles.find((v) => v.id === defaultVehicleId);
    if (v) {
      setSelectedId(v.id);
      setCustomerName(v.customer_name ?? "");
      setModel(vehicleModel(v));
      setPlate(v.plate_display ?? "");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultVehicleId]);

  const filtered = vehicles.filter((v) => {
    if (!search.trim()) return true;
    const s = search.toLowerCase();
    return [v.maker, v.model, v.plate_display, v.customer_name]
      .filter(Boolean)
      .some((val) => String(val).toLowerCase().includes(s));
  });

  const handleSelect = (vehicleId: string) => {
    setSelectedId(vehicleId);
    setSearch("");
    const v = vehicles.find((v) => v.id === vehicleId);
    if (v) {
      setCustomerName(v.customer_name ?? "");
      setModel(vehicleModel(v));
      setPlate(v.plate_display ?? "");
    }
  };

  const handleClear = () => {
    setSelectedId("");
    setSearch("");
    setCustomerName("");
    setModel("");
    setPlate("");
  };

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
            既存車両を選択すると顧客名・車両情報が自動入力されます（必須）
          </p>
        </div>

        <input type="hidden" name="vehicle_id" value={selectedId} />

        {selected ? (
          <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5">
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-emerald-900 truncate">
                {vehicleLabel(selected)}
              </div>
              {selected.customer_name && (
                <div className="text-xs text-emerald-700 mt-0.5">
                  {selected.customer_name}
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
          <div className="relative">
            <input
              id={uid}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={
                vehicles.length === 0
                  ? "登録車両がありません"
                  : "車種・ナンバー・顧客名で検索…"
              }
              disabled={vehicles.length === 0}
              autoComplete="off"
              className={`${inputCls} pr-10 disabled:bg-neutral-100 disabled:text-neutral-500`}
            />
            {search && filtered.length === 0 && (
              <div className="absolute z-10 mt-1 w-full rounded-xl border border-neutral-200 bg-white p-3 text-sm text-neutral-500 shadow-md">
                一致する車両が見つかりません
              </div>
            )}
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
                      {v.customer_name && (
                        <span className="ml-2 text-xs text-neutral-500">
                          {v.customer_name}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
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
          <label className={labelCls}>
            <span className={labelTextCls}>
              お客様名 <span className="text-red-500">*</span>
            </span>
            <input
              name="customer_name"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              className={inputCls}
              placeholder="山田 太郎"
              required
            />
          </label>

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
