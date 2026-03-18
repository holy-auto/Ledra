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

const STORAGE_KEY = "cartrust_active_store";

export function StoreProvider({ children }: { children: ReactNode }) {
  const [stores, setStores] = useState<Store[]>([]);
  const [activeStoreId, setActiveStoreIdState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchStores = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/stores", { cache: "no-store" });
      if (!res.ok) {
        setStores([]);
        return;
      }
      const data = await res.json();
      setStores(data.stores ?? []);
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

  const activeStore = activeStoreId
    ? stores.find((s) => s.id === activeStoreId) ?? null
    : null;

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
