import { Select } from "holy-cert";

const MENU_OPTIONS = [
  { value: "coating", label: "ボディコーティング" },
  { value: "ppf", label: "PPF（プロテクションフィルム）" },
  { value: "repaint", label: "鈑金塗装" },
];

export function Default() {
  return <Select placeholder="施工メニューを選択" options={MENU_OPTIONS} className="max-w-xs" />;
}

export function ErrorState() {
  return <Select options={MENU_OPTIONS} error aria-label="施工メニュー" className="max-w-xs" />;
}
