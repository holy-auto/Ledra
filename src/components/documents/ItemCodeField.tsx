"use client";
import { useState } from "react";
import { formatJpy } from "@/lib/format";

export type MenuItemOption = {
  id: string;
  item_code: string | null;
  name: string;
  unit_price: number;
};

/**
 * 品番(item_code)で品目マスタを検索し、選択した品目を明細行に反映するための入力欄。
 * 帳票作成フォーム(DocumentForm)で使用する。
 */
export default function ItemCodeField({
  value,
  menuItems,
  onSelect,
  onChange,
}: {
  value: string;
  menuItems: MenuItemOption[];
  onSelect: (item: MenuItemOption) => void;
  onChange: (code: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const q = value.trim().toLowerCase();
  const matches = q ? menuItems.filter((m) => (m.item_code ?? "").toLowerCase().includes(q)).slice(0, 20) : [];

  return (
    <div className="relative">
      <input
        type="text"
        className="input-field py-1 text-xs w-full font-mono"
        placeholder="品番で検索 / 入力"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
      />
      {open && matches.length > 0 && (
        <ul className="absolute z-10 mt-1 max-h-56 w-64 overflow-auto rounded border border-border-subtle bg-surface shadow-lg text-xs">
          {matches.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                className="block w-full px-2 py-1.5 text-left hover:bg-accent/10"
                onMouseDown={(e) => {
                  // input の blur より先に発火させ、選択を確定させる
                  e.preventDefault();
                  onSelect(m);
                  setOpen(false);
                }}
              >
                <span className="font-mono text-muted">{m.item_code}</span>{" "}
                <span className="text-primary">{m.name}</span>{" "}
                <span className="text-muted">({formatJpy(m.unit_price)})</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
