import { create } from "zustand";
import type { AppRole, UserProfile } from "@/lib/auth";

export interface StoreInfo {
  id: string;
  name: string;
}

interface AuthState {
  user: UserProfile | null;
  selectedStore: StoreInfo | null;
  isLoading: boolean;
  isAuthenticated: boolean;

  setUser: (user: UserProfile | null) => void;
  setSelectedStore: (store: StoreInfo | null) => void;
  setLoading: (loading: boolean) => void;
  reset: () => void;

  // ヘルパー
  hasMinRole: (minRole: AppRole) => boolean;
  /**
   * D-B2 是正 (2026-09-08): 「店舗なしで続行」時、selectedStore.id には空文字が
   * 入る（(auth)/select-store.tsx 参照）。この空文字を uuid 列へ直接 insert/query
   * すると "invalid input syntax for type uuid" で必ず失敗する。呼び出し側ごとに
   * `selectedStore?.id || null` を書くと1箇所書き忘れるたびに再発するので、
   * ここに1本化する。
   */
  getSelectedStoreId: () => string | null;
}

const ROLE_RANK: Record<AppRole, number> = {
  viewer: 1,
  staff: 2,
  admin: 3,
  owner: 4,
  super_admin: 5,
};

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  selectedStore: null,
  isLoading: true,
  isAuthenticated: false,

  setUser: (user) =>
    set({
      user,
      isAuthenticated: !!user,
      isLoading: false,
    }),

  setSelectedStore: (store) => set({ selectedStore: store }),

  setLoading: (isLoading) => set({ isLoading }),

  reset: () =>
    set({
      user: null,
      selectedStore: null,
      isLoading: false,
      isAuthenticated: false,
    }),

  hasMinRole: (minRole) => {
    const { user } = get();
    if (!user) return false;
    return ROLE_RANK[user.role] >= ROLE_RANK[minRole];
  },

  getSelectedStoreId: () => get().selectedStore?.id || null,
}));
