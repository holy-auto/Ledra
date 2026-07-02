"use client";

import { useState } from "react";
import useSWR from "swr";
import { fetcher } from "@/lib/swr";

type PickerStaff = {
  id: string;
  name: string;
  kind: string | null;
  is_active: boolean;
};

const CUSTOM = "__custom__";

/**
 * 担当者名の入力フィールド。
 *
 * スタッフマスタ (/api/admin/staff/picker) が引ければ select 選択にして
 * 表記ゆれを防ぎ、担当者別分析 (/admin/analytics/staff) のデータ品質を保つ。
 * マスタが空・取得失敗・権限なしの場合は従来どおりの自由入力にフォールバックする。
 * 「その他（自由入力）」で外注職人などマスタ外の名前も入力できる。
 */
export default function StaffNameField({
  value,
  onChange,
  placeholder,
  inputCls,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  inputCls: string;
}) {
  const { data } = useSWR<{ staff: PickerStaff[] }>("/api/admin/staff/picker", fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 60_000,
  });
  // 選択肢は在籍中のみ。休止中の担当者名が既に入っている場合は「その他」扱いで保持される
  const activeStaff = (data?.staff ?? []).filter((s) => s.is_active);
  const [customMode, setCustomMode] = useState(false);

  // マスタが引けない・空のときは従来の自由入力
  if (activeStaff.length === 0) {
    return (
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={inputCls} />
    );
  }

  const inMaster = activeStaff.some((s) => s.name === value);
  const selectValue = customMode || (value && !inMaster) ? CUSTOM : value;

  return (
    <div className="space-y-1.5">
      <select
        value={selectValue}
        onChange={(e) => {
          if (e.target.value === CUSTOM) {
            setCustomMode(true);
            onChange("");
          } else {
            setCustomMode(false);
            onChange(e.target.value);
          }
        }}
        className={inputCls}
      >
        <option value="">選択してください</option>
        {activeStaff.map((s) => (
          <option key={s.id} value={s.name}>
            {s.name}
          </option>
        ))}
        <option value={CUSTOM}>その他（自由入力）</option>
      </select>
      {selectValue === CUSTOM && (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={inputCls}
        />
      )}
    </div>
  );
}
