"use client";

import { useStoreContext } from "@/lib/stores/StoreContext";

export default function StoreSelector() {
  const { stores, activeStoreId, setActiveStoreId, loading } = useStoreContext();

  if (loading || stores.length <= 1) return null;

  return (
    <div className="px-3 py-2" style={{ borderBottom: "1px solid rgba(0,0,0,0.04)" }}>
      <select
        value={activeStoreId ?? ""}
        onChange={(e) => setActiveStoreId(e.target.value || null)}
        className="w-full rounded-lg border border-[rgba(0,0,0,0.08)] bg-white/80 px-2.5 py-1.5 text-[12px] font-medium text-[#1d1d1f] outline-none transition-all focus:border-[#0071e3] focus:ring-1 focus:ring-[#0071e3]"
      >
        <option value="">全店舗</option>
        {stores
          .filter((s) => s.is_active)
          .map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
      </select>
    </div>
  );
}
