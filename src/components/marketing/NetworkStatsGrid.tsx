import { AnimatedCounter } from "./AnimatedCounter";

export type NetworkStatItem = { label: string; value: number; unit: string };

export function NetworkStatsGrid({ items }: { items: NetworkStatItem[] }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
      {items.map((item) => (
        <div key={item.label} className="rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-6 text-center">
          <div className="text-2xl md:text-3xl font-bold text-white tracking-tight">
            <AnimatedCounter target={item.value} suffix={item.unit} />
          </div>
          <div className="mt-2 text-xs font-medium text-white">{item.label}</div>
        </div>
      ))}
    </div>
  );
}
