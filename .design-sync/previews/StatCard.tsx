import { StatCard } from "holy-cert";

export function Grid() {
  return (
    <div className="grid grid-cols-2 gap-4">
      <StatCard label="今月の発行件数" value="128件" caption="前月比 +12%" />
      <StatCard label="平均施工単価" value="¥48,200" />
      <StatCard label="保留中の証明書" value="3件" caption="要対応" />
      <StatCard label="登録店舗数" value="7店舗" />
    </div>
  );
}
