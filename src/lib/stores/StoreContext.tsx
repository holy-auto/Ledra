"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

type Store = {
  id: string;
  name: string;
  is_default: boolean;
  is_active: boolean;
};

type StoreContextValue = {
  stores: Store[];
  activeStoreId: string | null; // null = "全店舗"
  activeStore: Store | null;
  setActiveStoreId: (id: string | null) => void;
  loading: boolean;
  refresh: () => Promise<void>;
};

const StoreContext = createContext<StoreContextValue>({
  stores: [],
  activeStoreId: null,
  activeStore: null,
  setActiveStoreId: () => {},
  loading: true,
  refresh: async () => {},
});

export function useStoreContext() {
  return useContext(StoreContext);
}

const STORAGE_KEY = "ledra_active_store";

export function StoreProvider({ children }: { children: ReactNode }) {
  const [stores, setStores] = useState<Store[]>([]);
  const [activeStoreId, setActiveStoreIdState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const CACHE_KEY = "ledra_stores_cache";
  const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  const fetchStores = useCallback(async () => {
    try {
      // Try cache first for instant display
      const cached = sessionStorage.getItem(CACHE_KEY);
      if (cached) {
        try {
          const { data, ts } = JSON.parse(cached);
          if (Date.now() - ts < CACHE_TTL && Array.isArray(data)) {
            setStores(data);
            setLoading(false);
            // Revalidate in background
            fetch("/api/admin/stores", { cache: "no-store" })
              .then((r) => (r.ok ? r.json() : null))
              .then((d) => {
                if (d?.stores) {
                  setStores(d.stores);
                  sessionStorage.setItem(CACHE_KEY, JSON.stringify({ data: d.stores, ts: Date.now() }));
                }
              })
              .catch(() => {});
            return;
          }
        } catch {
          /* ignore corrupt cache */
        }
      }

      const res = await fetch("/api/admin/stores", { cache: "no-store" });
      if (!res.ok) {
        setStores([]);
        return;
      }
      const data = await res.json();
      const storeList = data.stores ?? [];
      setStores(storeList);
      sessionStorage.setItem(CACHE_KEY, JSON.stringify({ data: storeList, ts: Date.now() }));
    } catch {
      setStores([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStores();
    // Restore from localStorage
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) setActiveStoreIdState(saved);
  }, [fetchStores]);

  const setActiveStoreId = useCallback((id: string | null) => {
    setActiveStoreIdState(id);
    if (id) {
      localStorage.setItem(STORAGE_KEY, id);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  const activeStore = activeStoreId ? (stores.find((s) => s.id === activeStoreId) ?? null) : null;

  return (
    <StoreContext.Provider
      value={{
        stores,
        activeStoreId,
        activeStore,
        setActiveStoreId,
        loading,
        refresh: fetchStores,
      }}
    >
      {children}
    </StoreContext.Provider>
  );
}
