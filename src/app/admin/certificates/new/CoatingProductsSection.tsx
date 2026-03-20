"use client";

import { useState, useEffect } from "react";

type Brand = {
  id: string;
  name: string;
  coating_products: Product[];
};

type Product = {
  id: string;
  name: string;
  product_code: string | null;
};

type Row = {
  id: number;
  location: string;
  brand_id: string;
  brand_name: string;
  product_id: string;
  product_name: string;
};

const LOCATION_PRESETS = [
  "ボンネット",
  "ルーフ",
  "右フロントフェンダー",
  "左フロントフェンダー",
  "右フロントドア",
  "左フロントドア",
  "右リアドア",
  "左リアドア",
  "右リアフェンダー",
  "左リアフェンダー",
  "トランク/リアゲート",
  "右サイドステップ",
  "左サイドステップ",
  "全体",
];

const inputCls =
  "w-full rounded-lg border border-neutral-300 bg-white px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400";
const selectCls =
  "w-full rounded-lg border border-neutral-300 bg-white px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400";

let nextId = 1;
function newRow(): Row {
  return { id: nextId++, location: "", brand_id: "", brand_name: "", product_id: "", product_name: "" };
}

export default function CoatingProductsSection() {
  const [rows, setRows] = useState<Row[]>([newRow()]);
  const [open, setOpen] = useState(false);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [brandsLoading, setBrandsLoading] = useState(false);

  useEffect(() => {
    if (!open || brands.length > 0) return;
    setBrandsLoading(true);
    fetch("/api/admin/brands")
      .then((r) => r.json())
      .then((j) => setBrands(j.brands ?? []))
      .catch(() => {})
      .finally(() => setBrandsLoading(false));
  }, [open, brands.length]);

  const update = (id: number, field: keyof Row, value: string) =>
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        if (field === "brand_id") {
          const brand = brands.find((b) => b.id === value);
          return { ...r, brand_id: value, brand_name: brand?.name ?? "", product_id: "", product_name: "" };
        }
        if (field === "product_id") {
          const brand = brands.find((b) => b.id === r.brand_id);
          const product = brand?.coating_products?.find((p) => p.id === value);
          return { ...r, product_id: value, product_name: product?.name ?? "" };
        }
        return { ...r, [field]: value };
      })
    );

  const addRow = () => setRows((prev) => [...prev, newRow()]);
  const removeRow = (id: number) =>
    setRows((prev) => (prev.length > 1 ? prev.filter((r) => r.id !== id) : prev));

  const validRows = rows.filter((r) => r.location.trim() || r.brand_id);
  const jsonValue = JSON.stringify(
    validRows.map((r) => ({
      location: r.location.trim(),
      brand_id: r.brand_id || null,
      brand_name: r.brand_name || null,
      product_id: r.product_id || null,
      product_name: r.product_name || null,
    }))
  );

  return (
    <div className="border-t border-neutral-100 pt-6">
      <input type="hidden" name="coating_products_json" value={jsonValue} />

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between text-left"
      >
        <div>
          <div className="text-xs font-semibold tracking-[0.18em] text-neutral-500">
            COATING PRODUCTS
          </div>
          <div className="mt-0.5 text-base font-semibold text-neutral-900">
            コーティング剤
            <span className="ml-2 text-xs font-normal text-neutral-500">任意</span>
          </div>
        </div>
        <span className="text-sm text-neutral-500">{open ? "▲ 閉じる" : "▼ 入力する"}</span>
      </button>

      {open && (
        <div className="mt-4 space-y-3">
          <p className="text-xs text-neutral-500">
            施工箇所ごとに使用したコーティング剤を記録します。
          </p>

          {brandsLoading ? (
            <p className="text-xs text-neutral-400">ブランドを読み込み中...</p>
          ) : brands.length === 0 ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
              ブランドが登録されていません。
              <a href="/admin/settings/brands" target="_blank" className="ml-1 underline">
                ブランドを追加する →
              </a>
            </div>
          ) : null}

          {/* Header */}
          <div className="hidden sm:grid sm:grid-cols-[2fr_2fr_2fr_auto] gap-2 px-1">
            <span className="text-[11px] font-semibold text-neutral-500 uppercase">部位</span>
            <span className="text-[11px] font-semibold text-neutral-500 uppercase">ブランド</span>
            <span className="text-[11px] font-semibold text-neutral-500 uppercase">製品</span>
            <span />
          </div>

          {rows.map((row) => {
            const brandProducts = brands.find((b) => b.id === row.brand_id)?.coating_products ?? [];
            return (
              <div key={row.id} className="grid grid-cols-1 sm:grid-cols-[2fr_2fr_2fr_auto] gap-2 items-start rounded-xl border border-neutral-100 bg-neutral-50 p-3 sm:p-0 sm:bg-transparent sm:border-0">
                {/* Location */}
                <div>
                  <span className="sm:hidden text-[11px] font-semibold text-neutral-500 uppercase mb-1 block">部位</span>
                  <input
                    list={`cp-loc-${row.id}`}
                    value={row.location}
                    onChange={(e) => update(row.id, "location", e.target.value)}
                    placeholder="ボンネット"
                    className={inputCls}
                  />
                  <datalist id={`cp-loc-${row.id}`}>
                    {LOCATION_PRESETS.map((p) => (
                      <option key={p} value={p} />
                    ))}
                  </datalist>
                </div>

                {/* Brand */}
                <div>
                  <span className="sm:hidden text-[11px] font-semibold text-neutral-500 uppercase mb-1 block">ブランド</span>
                  <select
                    value={row.brand_id}
                    onChange={(e) => update(row.id, "brand_id", e.target.value)}
                    className={selectCls}
                  >
                    <option value="">選択</option>
                    {brands.map((b) => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>

                {/* Product */}
                <div>
                  <span className="sm:hidden text-[11px] font-semibold text-neutral-500 uppercase mb-1 block">製品</span>
                  <select
                    value={row.product_id}
                    onChange={(e) => update(row.id, "product_id", e.target.value)}
                    disabled={!row.brand_id || brandProducts.length === 0}
                    className={`${selectCls} disabled:bg-neutral-100 disabled:text-neutral-400`}
                  >
                    <option value="">選択</option>
                    {brandProducts.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}{p.product_code ? ` (${p.product_code})` : ""}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Remove */}
                <button
                  type="button"
                  onClick={() => removeRow(row.id)}
                  disabled={rows.length === 1}
                  className="mt-1 self-center rounded-lg border border-neutral-200 px-2 py-1.5 text-xs text-neutral-500 hover:border-red-200 hover:text-red-500 disabled:opacity-30 sm:mt-0"
                >
                  ✕
                </button>
              </div>
            );
          })}

          <button
            type="button"
            onClick={addRow}
            className="rounded-lg border border-dashed border-neutral-300 px-4 py-2 text-sm text-neutral-500 hover:border-neutral-400 hover:text-neutral-700"
          >
            ＋ 部位を追加
          </button>

          {validRows.length > 0 && (
            <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3 text-xs text-neutral-500">
              {validRows.length} 部位を記録します
            </div>
          )}
        </div>
      )}
    </div>
  );
}
