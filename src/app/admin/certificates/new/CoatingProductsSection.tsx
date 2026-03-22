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
  area: string;       // preset key or "custom"
  customArea: string; // free text when area === "custom"
  brand_id: string;
  brand_name: string;
  product_id: string;
  product_name: string;
  lot_number: string; // ロット番号
  film_type: string;  // PPF用: gloss | matte | satin | color | ""
};

// PPFフィルムタイプ選択肢
const FILM_TYPE_OPTIONS = [
  { value: "", label: "―" },
  { value: "gloss", label: "グロス（光沢）" },
  { value: "matte", label: "マット（艶消し）" },
  { value: "satin", label: "サテン" },
  { value: "color", label: "カラー" },
  { value: "black", label: "ブラック" },
] as const;

// 施工部位プリセット
const AREA_PRESETS = [
  { value: "全体", label: "全体（ボディ全体）" },
  { value: "ボディ", label: "ボディ" },
  { value: "ボンネット", label: "ボンネット" },
  { value: "ルーフ", label: "ルーフ" },
  { value: "トランク", label: "トランク / リアゲート" },
  { value: "右フロント", label: "右フロント" },
  { value: "左フロント", label: "左フロント" },
  { value: "右リア", label: "右リア" },
  { value: "左リア", label: "左リア" },
  { value: "ホイール", label: "ホイール（全）" },
  { value: "フロントガラス", label: "フロントガラス" },
  { value: "リアガラス", label: "リアガラス" },
  { value: "サイドガラス", label: "サイドガラス" },
  { value: "内装", label: "内装" },
  { value: "バンパー", label: "バンパー / スポイラー" },
  { value: "custom", label: "その他（カスタム）" },
];

const selectCls =
  "w-full rounded-lg border border-neutral-300 bg-white px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400";
const inputCls =
  "w-full rounded-lg border border-neutral-300 bg-white px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400";

let nextId = 1;
function newRow(): Row {
  return {
    id: nextId++,
    area: "",
    customArea: "",
    brand_id: "",
    brand_name: "",
    product_id: "",
    product_name: "",
    lot_number: "",
    film_type: "",
  };
}

type Props = {
  serviceType?: string; // "ppf" | "coating" | etc
};

export default function CoatingProductsSection({ serviceType }: Props) {
  const isPpf = serviceType === "ppf";
  const [rows, setRows] = useState<Row[]>([newRow()]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [brandsLoading, setBrandsLoading] = useState(false);
  const [brandsLoaded, setBrandsLoaded] = useState(false);

  // マウント時にブランド一覧を取得
  useEffect(() => {
    if (brandsLoaded) return;
    setBrandsLoading(true);
    fetch("/api/admin/brands")
      .then((r) => r.json())
      .then((j) => {
        setBrands(j.brands ?? []);
        setBrandsLoaded(true);
      })
      .catch(() => setBrandsLoaded(true))
      .finally(() => setBrandsLoading(false));
  }, [brandsLoaded]);

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

  const validRows = rows.filter((r) => {
    const location = r.area === "custom" ? r.customArea.trim() : r.area;
    return location || r.brand_id;
  });

  const jsonValue = JSON.stringify(
    validRows.map((r) => ({
      location: r.area === "custom" ? r.customArea.trim() : r.area,
      brand_id: r.brand_id || null,
      brand_name: r.brand_name || null,
      product_id: r.product_id || null,
      product_name: r.product_name || null,
      lot_number: r.lot_number?.trim() || null,
      ...(isPpf && r.film_type ? { film_type: r.film_type } : {}),
    }))
  );

  return (
    <div className="border-t border-neutral-100 pt-6 space-y-4">
      <input type="hidden" name="coating_products_json" value={jsonValue} />

      <div>
        <div className="text-xs font-semibold tracking-[0.18em] text-neutral-500">
          {isPpf ? "PPF FILM" : "COATING PRODUCTS"}
        </div>
        <div className="mt-0.5 text-base font-semibold text-neutral-900">
          {isPpf ? "使用フィルム" : "コーティング剤"}
          <span className="ml-2 text-xs font-normal text-neutral-500">任意</span>
        </div>
        <p className="mt-1 text-xs text-neutral-500">
          {isPpf
            ? "使用したPPFフィルムのブランド・製品・タイプを記録します。"
            : "施工箇所ごとに使用したコーティング剤を記録します。"}
        </p>
      </div>

      {brandsLoading ? (
        <p className="text-xs text-neutral-400">ブランドを読み込み中...</p>
      ) : brands.length === 0 && brandsLoaded ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
          ブランドが未登録です。先に
          <a href="/admin/settings/brands" target="_blank" className="ml-1 underline font-medium">
            ブランドを追加
          </a>
          してください。ブランドがなくても部位のみ記録できます。
        </div>
      ) : null}

      {/* ヘッダー行 */}
      <div className={`hidden sm:grid gap-2 px-1 ${isPpf ? "sm:grid-cols-[1.5fr_2fr_2fr_1.5fr_1.5fr_auto]" : "sm:grid-cols-[2fr_2fr_2fr_1.5fr_auto]"}`}>
        <span className="text-[11px] font-semibold text-neutral-500 uppercase">{isPpf ? "部位" : "部位"}</span>
        <span className="text-[11px] font-semibold text-neutral-500 uppercase">ブランド</span>
        <span className="text-[11px] font-semibold text-neutral-500 uppercase">製品</span>
        {isPpf && <span className="text-[11px] font-semibold text-neutral-500 uppercase">タイプ</span>}
        <span className="text-[11px] font-semibold text-neutral-500 uppercase">ロット番号</span>
        <span />
      </div>

      {rows.map((row) => {
        const brandProducts = brands.find((b) => b.id === row.brand_id)?.coating_products ?? [];
        return (
          <div
            key={row.id}
            className={`grid grid-cols-1 gap-2 items-start rounded-xl border border-neutral-100 bg-neutral-50 p-3 sm:p-0 sm:bg-transparent sm:border-0 ${isPpf ? "sm:grid-cols-[1.5fr_2fr_2fr_1.5fr_1.5fr_auto]" : "sm:grid-cols-[2fr_2fr_2fr_1.5fr_auto]"}`}
          >
            {/* 部位 */}
            <div>
              <span className="sm:hidden text-[11px] font-semibold text-neutral-500 uppercase mb-1 block">部位</span>
              <select
                value={row.area}
                onChange={(e) => update(row.id, "area", e.target.value)}
                className={selectCls}
              >
                <option value="">部位を選択</option>
                {AREA_PRESETS.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
              {row.area === "custom" && (
                <input
                  value={row.customArea}
                  onChange={(e) => update(row.id, "customArea", e.target.value)}
                  placeholder="部位名を入力"
                  className={`${inputCls} mt-1`}
                />
              )}
            </div>

            {/* ブランド */}
            <div>
              <span className="sm:hidden text-[11px] font-semibold text-neutral-500 uppercase mb-1 block">ブランド</span>
              <select
                value={row.brand_id}
                onChange={(e) => update(row.id, "brand_id", e.target.value)}
                disabled={brands.length === 0}
                className={`${selectCls} disabled:bg-neutral-100 disabled:text-neutral-400`}
              >
                <option value="">選択</option>
                {brands.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>

            {/* 製品 */}
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

            {/* フィルムタイプ（PPFのみ） */}
            {isPpf && (
              <div>
                <span className="sm:hidden text-[11px] font-semibold text-neutral-500 uppercase mb-1 block">タイプ</span>
                <select
                  value={row.film_type}
                  onChange={(e) => update(row.id, "film_type", e.target.value)}
                  className={selectCls}
                >
                  {FILM_TYPE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
            )}

            {/* ロット番号 */}
            <div>
              <span className="sm:hidden text-[11px] font-semibold text-neutral-500 uppercase mb-1 block">ロット番号</span>
              <input
                value={row.lot_number}
                onChange={(e) => update(row.id, "lot_number", e.target.value)}
                placeholder="ロット番号"
                className={inputCls}
              />
            </div>

            {/* 削除 */}
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
        <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-2.5 text-xs text-neutral-500">
          {validRows.length} 部位を記録します
        </div>
      )}
    </div>
  );
}
