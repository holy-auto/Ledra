"use client";

import { useState, useEffect } from "react";
import HelpTooltip from "@/components/ui/HelpTooltip";

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
  area: string; // preset key or "custom"
  customArea: string; // free text when area === "custom"
  brand_id: string;
  brand_name: string;
  product_id: string; // マスター製品ID、または自由入力時 "__custom__"
  product_name: string;
  customProductName: string; // 自由入力時の製品名下書き（マスター未登録品・納品書OCR取り込み用）
  product_code: string; // 品番（マスター選択時は自動入力、常に編集可）
  lot_number: string; // ロット番号
  film_type: string; // PPF用: gloss | matte | satin | color | ""
};

const CUSTOM_PRODUCT = "__custom__";

// 納品書OCRが返す明細1行分
type DeliveryNoteLine = { label: string; code: string | null };

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
  "w-full rounded-lg border border-border-default bg-surface px-2.5 py-2 text-sm text-primary focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent";
const inputCls =
  "w-full rounded-lg border border-border-default bg-surface px-2.5 py-2 text-sm text-primary placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent";

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
    customProductName: "",
    product_code: "",
    lot_number: "",
    film_type: "",
  };
}

type Props = {
  serviceType?: string; // "ppf" | "coating" | etc
  /** 納品書から読み取って下書き入力する機能を出すか（Standard以上）。 */
  canDeliveryNoteExtract?: boolean;
};

export default function CoatingProductsSection({ serviceType, canDeliveryNoteExtract }: Props) {
  const isPpf = serviceType === "ppf";
  const [rows, setRows] = useState<Row[]>([newRow()]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [brandsLoading, setBrandsLoading] = useState(false);
  const [brandsLoaded, setBrandsLoaded] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [extractedCount, setExtractedCount] = useState(0);
  // 納品書の明細が上限(8件)を超えていた場合の元の件数。null なら打ち切りなし。
  const [extractTruncatedFrom, setExtractTruncatedFrom] = useState<number | null>(null);

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
          return {
            ...r,
            brand_id: value,
            brand_name: brand?.name ?? "",
            product_id: "",
            product_name: "",
            customProductName: "",
            product_code: "",
          };
        }
        if (field === "product_id") {
          if (value === CUSTOM_PRODUCT) {
            return { ...r, product_id: CUSTOM_PRODUCT, product_name: r.customProductName };
          }
          const brand = brands.find((b) => b.id === r.brand_id);
          const product = brand?.coating_products?.find((p) => p.id === value);
          return {
            ...r,
            product_id: value,
            product_name: product?.name ?? "",
            product_code: product?.product_code ?? "",
          };
        }
        if (field === "customProductName") {
          return { ...r, customProductName: value, product_name: value };
        }
        return { ...r, [field]: value };
      }),
    );

  const addRow = () => setRows((prev) => [...prev, newRow()]);
  const removeRow = (id: number) => setRows((prev) => (prev.length > 1 ? prev.filter((r) => r.id !== id) : prev));

  /** 納品書OCRの明細を下書き行として追加する（部位は未選択のまま、後で人が選ぶ）。 */
  const applyExtractedLines = (lines: DeliveryNoteLine[]) => {
    if (lines.length === 0) return;
    const capped = lines.slice(0, 8);
    setRows((prev) => {
      // 最初の行が未入力（空の初期行）なら、それを1件目の受け皿として使う。
      const first = prev[0];
      const isFirstRowEmpty =
        prev.length === 1 && !first.area && !first.brand_id && !first.product_name.trim() && !first.product_code.trim();
      const base = isFirstRowEmpty ? [] : prev;
      const added = capped.map((l) => {
        const row = newRow();
        row.product_id = CUSTOM_PRODUCT;
        row.customProductName = l.label;
        row.product_name = l.label;
        row.product_code = l.code ?? "";
        return row;
      });
      return [...base, ...added];
    });
    // 実際に追加した件数を表示する（元の明細が上限を超える場合は打ち切りを明示する）。
    setExtractedCount(capped.length);
    setExtractTruncatedFrom(lines.length > capped.length ? lines.length : null);
  };

  const handleDeliveryNoteFile = async (file: File) => {
    setExtracting(true);
    setExtractError(null);
    setExtractedCount(0);
    setExtractTruncatedFrom(null);
    try {
      const fd = new FormData();
      fd.append("delivery_note", file);
      const res = await fetch("/api/admin/certificates/delivery-note-extract", { method: "POST", body: fd });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.message ?? j?.error ?? `HTTP ${res.status}`);
      const lines = (j?.lines as DeliveryNoteLine[] | undefined) ?? [];
      if (lines.length === 0) {
        setExtractError(
          (j?.notice as string | undefined) ?? "納品書から品目を読み取れませんでした。手入力してください。",
        );
        return;
      }
      applyExtractedLines(lines);
    } catch (e: unknown) {
      setExtractError(e instanceof Error ? e.message : String(e));
    } finally {
      setExtracting(false);
    }
  };

  const validRows = rows.filter((r) => {
    const location = r.area === "custom" ? r.customArea.trim() : r.area;
    return location || r.brand_id || r.product_name.trim() || r.product_code.trim();
  });

  const jsonValue = JSON.stringify(
    validRows.map((r) => ({
      location: r.area === "custom" ? r.customArea.trim() : r.area,
      brand_id: r.brand_id || null,
      brand_name: r.brand_name || null,
      product_id: r.product_id && r.product_id !== CUSTOM_PRODUCT ? r.product_id : null,
      product_name: r.product_name.trim() || null,
      product_code: r.product_code?.trim() || null,
      lot_number: r.lot_number?.trim() || null,
      ...(isPpf && r.film_type ? { film_type: r.film_type } : {}),
    })),
  );

  return (
    <div className="border-t border-border-subtle pt-6 space-y-4">
      <input type="hidden" name="coating_products_json" value={jsonValue} />

      <div>
        <div className="text-xs font-semibold tracking-[0.18em] text-muted">
          {isPpf ? "PPF FILM" : "COATING PRODUCTS"}
        </div>
        <div className="mt-0.5 text-base font-semibold text-primary inline-flex items-center gap-1.5 flex-wrap">
          {isPpf ? "使用フィルム" : "コーティング剤"}
          <HelpTooltip>
            {isPpf
              ? "使用したPPFフィルムの製品名・部位・ロット番号を記録します。製品はコーティング剤マスター（設定→ブランド管理）で事前登録した中から選択できます。"
              : "施工に使ったコーティング剤を記録します。複数製品の併用 (下地+トップ等) も追加可能。製品名はマスター登録から選択でき、ロット番号も残せるためトラブル時の遡及調査に役立ちます。"}
          </HelpTooltip>
          <span className="ml-2 text-xs font-normal text-muted">任意</span>
        </div>
        <p className="mt-1 text-xs text-muted">
          {isPpf
            ? "使用したPPFフィルムのブランド・製品・タイプを記録します。"
            : "施工箇所ごとに使用したコーティング剤を記録します。"}
        </p>
      </div>

      {canDeliveryNoteExtract && (
        <div className="rounded-xl border border-border-default bg-surface p-3 space-y-2">
          <label className="flex items-center gap-2 text-sm font-medium text-secondary cursor-pointer w-fit">
            <span className="rounded-lg border border-border-default bg-inset px-3 py-2 text-xs font-medium hover:bg-surface-hover">
              📄 納品書を撮影して読み取り
            </span>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              disabled={extracting}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void handleDeliveryNoteFile(file);
              }}
            />
            {extracting && <span className="text-xs text-muted">読み取り中…</span>}
          </label>
          <p className="text-xs text-muted">
            部品・液剤の納品書を撮影すると、AIが品名・品番を読み取って下書き行を追加します（内容は必ず確認・編集してください）。
          </p>
          {extractedCount > 0 && !extracting && (
            <p className="text-xs text-success-text">
              ✅ {extractedCount} 件を下書きに追加しました。
              {extractTruncatedFrom && (
                <span className="text-warning-text">
                  {" "}
                  （納品書には {extractTruncatedFrom} 件ありましたが、上限のため先頭 {extractedCount}{" "}
                  件のみ取り込みました。残りは手入力してください。）
                </span>
              )}
            </p>
          )}
          {extractError && <p className="text-xs text-danger-text">{extractError}</p>}
        </div>
      )}

      {brandsLoading ? (
        <p className="text-xs text-muted">ブランドを読み込み中...</p>
      ) : brands.length === 0 && brandsLoaded ? (
        <div className="rounded-xl border border-warning/30 bg-warning-dim p-3 text-xs text-warning-text">
          ブランドが未登録です。先に
          <a href="/admin/settings/brands" target="_blank" className="ml-1 underline font-medium">
            ブランドを追加
          </a>
          してください。ブランドがなくても部位のみ記録できます。
        </div>
      ) : null}

      {/* ヘッダー行 */}
      <div
        className={`hidden sm:grid gap-2 px-1 ${isPpf ? "sm:grid-cols-[1.5fr_2fr_2fr_1.5fr_1.5fr_1.5fr_auto]" : "sm:grid-cols-[2fr_2fr_2fr_1.5fr_1.5fr_auto]"}`}
      >
        <span className="text-[11px] font-semibold text-muted uppercase">{isPpf ? "部位" : "部位"}</span>
        <span className="text-[11px] font-semibold text-muted uppercase">ブランド</span>
        <span className="text-[11px] font-semibold text-muted uppercase">製品</span>
        {isPpf && <span className="text-[11px] font-semibold text-muted uppercase">タイプ</span>}
        <span className="text-[11px] font-semibold text-muted uppercase">品番</span>
        <span className="text-[11px] font-semibold text-muted uppercase">ロット番号</span>
        <span />
      </div>

      {rows.map((row) => {
        const brandProducts = brands.find((b) => b.id === row.brand_id)?.coating_products ?? [];
        return (
          <div
            key={row.id}
            className={`grid grid-cols-1 gap-2 items-start rounded-xl border border-border-subtle bg-inset p-3 sm:p-0 sm:bg-transparent sm:border-0 ${isPpf ? "sm:grid-cols-[1.5fr_2fr_2fr_1.5fr_1.5fr_1.5fr_auto]" : "sm:grid-cols-[2fr_2fr_2fr_1.5fr_1.5fr_auto]"}`}
          >
            {/* 部位 */}
            <div>
              <span className="sm:hidden text-[11px] font-semibold text-muted uppercase mb-1 block">部位</span>
              <select value={row.area} onChange={(e) => update(row.id, "area", e.target.value)} className={selectCls}>
                <option value="">部位を選択</option>
                {AREA_PRESETS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
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
              <span className="sm:hidden text-[11px] font-semibold text-muted uppercase mb-1 block">ブランド</span>
              <select
                value={row.brand_id}
                onChange={(e) => update(row.id, "brand_id", e.target.value)}
                disabled={brands.length === 0}
                className={`${selectCls} disabled:bg-surface-hover disabled:text-muted`}
              >
                <option value="">選択</option>
                {brands.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>

            {/* 製品 */}
            <div>
              <span className="sm:hidden text-[11px] font-semibold text-muted uppercase mb-1 block">製品</span>
              <select
                value={row.product_id}
                onChange={(e) => update(row.id, "product_id", e.target.value)}
                className={selectCls}
              >
                <option value="">選択</option>
                {brandProducts.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.product_code ? ` (${p.product_code})` : ""}
                  </option>
                ))}
                <option value={CUSTOM_PRODUCT}>その他（自由入力・下書き）</option>
              </select>
              {row.product_id === CUSTOM_PRODUCT && (
                <input
                  value={row.customProductName}
                  onChange={(e) => update(row.id, "customProductName", e.target.value)}
                  placeholder="製品名を入力（マスター未登録・納品書取り込み用）"
                  className={`${inputCls} mt-1`}
                />
              )}
            </div>

            {/* フィルムタイプ（PPFのみ） */}
            {isPpf && (
              <div>
                <span className="sm:hidden text-[11px] font-semibold text-muted uppercase mb-1 block">タイプ</span>
                <select
                  value={row.film_type}
                  onChange={(e) => update(row.id, "film_type", e.target.value)}
                  className={selectCls}
                >
                  {FILM_TYPE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* 品番 */}
            <div>
              <span className="sm:hidden text-[11px] font-semibold text-muted uppercase mb-1 block">品番</span>
              <input
                value={row.product_code}
                onChange={(e) => update(row.id, "product_code", e.target.value)}
                placeholder="品番"
                className={inputCls}
              />
            </div>

            {/* ロット番号 */}
            <div>
              <span className="sm:hidden text-[11px] font-semibold text-muted uppercase mb-1 block">ロット番号</span>
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
              className="mt-1 self-center rounded-lg border border-border-default px-2 py-1.5 text-xs text-muted hover:border-red-200 hover:text-red-500 disabled:opacity-30 sm:mt-0"
            >
              ✕
            </button>
          </div>
        );
      })}

      <button
        type="button"
        onClick={addRow}
        className="rounded-lg border border-dashed border-border-default px-4 py-2 text-sm text-muted hover:border-border-strong hover:text-primary"
      >
        ＋ 部位を追加
      </button>

      {validRows.length > 0 && (
        <div className="rounded-xl border border-border-default bg-inset p-2.5 text-xs text-muted">
          {validRows.length} 部位を記録します
        </div>
      )}
    </div>
  );
}
