"use client";

import { useBusinessMode, type SelectedBusinessMode } from "@/lib/business-mode/BusinessModeContext";

/**
 * BusinessModeToggle
 * ------------------------------------------------------------
 * 「今何の作業をしているか」でサイドバーの表示項目を絞り込むセレクタ。
 * 共通機能（顧客・車両・請求など）は選択に関わらず常時表示され、
 * 各モードに特化した項目だけが絞り込まれる。
 */

const OPTIONS: { key: SelectedBusinessMode; label: string }[] = [
  { key: "all", label: "すべて" },
  { key: "mechanic", label: "整備" },
  { key: "body_paint", label: "鈑金塗装" },
  { key: "coating", label: "コーティング" },
  { key: "ppf", label: "PPF" },
];

export default function BusinessModeToggle() {
  const { mode, setMode } = useBusinessMode();

  return (
    <select
      aria-label="業種別モード"
      title="今の作業に応じてサイドバーの表示を絞り込みます"
      value={mode}
      onChange={(e) => setMode(e.target.value as SelectedBusinessMode)}
      className="rounded-lg border border-border-subtle bg-surface px-2 py-1 text-[11px] font-semibold text-secondary focus:outline-none focus:ring-2 focus:ring-accent/30"
    >
      {OPTIONS.map((opt) => (
        <option key={opt.key} value={opt.key}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}
