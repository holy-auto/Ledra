import { create } from "zustand";
import type { AppRole, UserProfile } from "@/lib/auth";

interface StoreInfo {
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
}));
