"use client";

import { useState } from "react";
import HelpTooltip from "@/components/ui/HelpTooltip";
import StaffNameField from "./StaffNameField";
import { ACCESSORY_TYPE_OPTIONS, INSTALL_LOCATION_OPTIONS } from "@/lib/accessory/constants";

type AccessoryData = {
  accessory_types: string[];
  product_name: string;
  maker_name: string;
  install_location: string;
  serial_no: string;
  install_notes: string;
  warranty_info: string;
  installer_name: string;
};

const selectCls =
  "w-full rounded-lg border border-border-default bg-surface px-2.5 py-2 text-sm text-primary focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent";
const inputCls =
  "w-full rounded-lg border border-border-default bg-surface px-2.5 py-2 text-sm text-primary placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent";

export default function AccessoryDetailsSection() {
  const [data, setData] = useState<AccessoryData>({
    accessory_types: [],
    product_name: "",
    maker_name: "",
    install_location: "",
    serial_no: "",
    install_notes: "",
    warranty_info: "",
    installer_name: "",
  });

  const toggleType = (value: string) => {
    setData((prev) => ({
      ...prev,
      accessory_types: prev.accessory_types.includes(value)
        ? prev.accessory_types.filter((v) => v !== value)
        : [...prev.accessory_types, value],
    }));
  };

  const update = (field: keyof AccessoryData, value: string) => setData((prev) => ({ ...prev, [field]: value }));

  const jsonValue = JSON.stringify({
    accessory_types: data.accessory_types,
    product_name: data.product_name.trim() || null,
    maker_name: data.maker_name.trim() || null,
    install_location: data.install_location || null,
    serial_no: data.serial_no.trim() || null,
    install_notes: data.install_notes.trim() || null,
    warranty_info: data.warranty_info.trim() || null,
    installer_name: data.installer_name.trim() || null,
  });

  return (
    <div className="space-y-4">
      <input type="hidden" name="accessory_json" value={jsonValue} />

      <div>
        <div className="text-xs font-semibold tracking-[0.18em] text-muted">ACCESSORY DETAILS</div>
        <div className="mt-0.5 text-base font-semibold text-primary flex items-center gap-1.5">
          用品取付内容
          <HelpTooltip>
            取り付けた用品 (カーナビ・ETC・ドラレコ等) の種別・製品名・取付位置を記録します。
            製造番号を残すと、盗難・保証時の照合や取り違え防止に役立ちます。
          </HelpTooltip>
        </div>
        <p className="mt-1 text-xs text-muted">取り付けた用品の内容を記録します。</p>
      </div>

      {/* 用品カテゴリ（複数選択） */}
      <div>
        <label className="block text-sm font-medium text-secondary mb-2">用品カテゴリ（複数選択可）</label>
        <div className="flex flex-wrap gap-2">
          {ACCESSORY_TYPE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => toggleType(opt.value)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                data.accessory_types.includes(opt.value)
                  ? "border-accent/30 bg-accent-dim text-accent-text"
                  : "border-border-default bg-surface text-secondary hover:border-border-strong"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        {data.accessory_types.length > 0 && (
          <div className="mt-2 text-xs text-muted">{data.accessory_types.length} 項目を選択中</div>
        )}
      </div>

      {/* 製品名・型番 */}
      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-secondary">製品名・型番</span>
        <input
          value={data.product_name}
          onChange={(e) => update("product_name", e.target.value)}
          placeholder="例: 彩速ナビ MDV-M910HDF"
          className={inputCls}
        />
      </label>

      {/* メーカー */}
      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-secondary">メーカー</span>
        <input
          value={data.maker_name}
          onChange={(e) => update("maker_name", e.target.value)}
          placeholder="例: ケンウッド、パナソニック"
          className={inputCls}
        />
      </label>

      {/* 取付位置 */}
      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-secondary">取付位置</span>
        <select
          value={data.install_location}
          onChange={(e) => update("install_location", e.target.value)}
          className={selectCls}
        >
          <option value="">選択してください</option>
          {INSTALL_LOCATION_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>

      {/* 製造番号（任意） */}
      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-secondary flex items-center gap-1.5">
          製造番号・シリアル（任意）
          <HelpTooltip>製造番号を記録すると、保証・盗難照合や取り違え防止の証跡になります。</HelpTooltip>
        </span>
        <input
          value={data.serial_no}
          onChange={(e) => update("serial_no", e.target.value)}
          placeholder="例: SN-1234567890"
          className={inputCls}
        />
      </label>

      {/* 取付内容・備考 */}
      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-secondary">取付内容・備考</span>
        <textarea
          value={data.install_notes}
          onChange={(e) => update("install_notes", e.target.value)}
          placeholder="配線ルート、電源取り出し方法、追加加工などを記入してください"
          rows={3}
          className={inputCls}
        />
      </label>

      {/* 保証情報 */}
      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-secondary">取付保証情報</span>
        <textarea
          value={data.warranty_info}
          onChange={(e) => update("warranty_info", e.target.value)}
          placeholder="例: 取付工賃保証1年（配線不良に限る）"
          rows={2}
          className={inputCls}
        />
      </label>

      {/* 取付担当者 (スタッフマスタから選択、マスタ未登録時は自由入力) */}
      <div className="block space-y-1.5">
        <span className="text-sm font-medium text-secondary">取付担当者</span>
        <StaffNameField
          value={data.installer_name}
          onChange={(v) => update("installer_name", v)}
          placeholder="担当者名を入力"
          inputCls={inputCls}
        />
      </div>
    </div>
  );
}
