import * as SecureStore from "expo-secure-store";
import { create } from "zustand";
import { mobileApi } from "@/lib/api";

export type DisplayMode = "simple" | "standard" | "dense";
export type PreferenceScope = "account" | "device";

const DEVICE_MODE_KEY = "ledra.displayMode.device";

type PreferencesResponse = {
  displayMode: DisplayMode;
  onboardingCompleted: boolean;
};

type UiPreferencesState = {
  accountMode: DisplayMode;
  deviceOverride: DisplayMode | null;
  onboardingCompleted: boolean;
  loading: boolean;
  loadedForUser: string | null;
  load: (userId: string) => Promise<void>;
  setDisplayMode: (mode: DisplayMode, scope?: PreferenceScope) => Promise<void>;
  clearDeviceOverride: () => Promise<void>;
  completeOnboarding: (mode: DisplayMode) => Promise<void>;
  restartOnboarding: () => Promise<void>;
  reset: () => void;
};

function isDisplayMode(value: unknown): value is DisplayMode {
  return value === "simple" || value === "standard" || value === "dense";
}

export const useUiPreferencesStore = create<UiPreferencesState>((set, get) => ({
  accountMode: "standard",
  deviceOverride: null,
  onboardingCompleted: true,
  loading: false,
  loadedForUser: null,

  load: async (userId) => {
    if (get().loadedForUser === userId || get().loading) return;
    set({ loading: true });
    try {
      const [stored, response] = await Promise.all([
        SecureStore.getItemAsync(DEVICE_MODE_KEY),
        mobileApi<PreferencesResponse>("/ui-preferences"),
      ]);
      set({
        accountMode: isDisplayMode(response.displayMode) ? response.displayMode : "standard",
        deviceOverride: isDisplayMode(stored) ? stored : null,
        onboardingCompleted: Boolean(response.onboardingCompleted),
        loadedForUser: userId,
      });
    } finally {
      set({ loading: false });
    }
  },

  setDisplayMode: async (mode, scope = "account") => {
    if (scope === "device") {
      await SecureStore.setItemAsync(DEVICE_MODE_KEY, mode);
      set({ deviceOverride: mode });
      return;
    }

    const previous = get().accountMode;
    const previousDeviceOverride = get().deviceOverride;
    set({ accountMode: mode, deviceOverride: null });
    try {
      await SecureStore.deleteItemAsync(DEVICE_MODE_KEY);
      await mobileApi<PreferencesResponse>("/ui-preferences", { method: "PUT", body: { displayMode: mode } });
    } catch (error) {
      if (previousDeviceOverride) {
        await SecureStore.setItemAsync(DEVICE_MODE_KEY, previousDeviceOverride).catch(() => undefined);
      }
      set({ accountMode: previous, deviceOverride: previousDeviceOverride });
      throw error;
    }
  },

  clearDeviceOverride: async () => {
    await SecureStore.deleteItemAsync(DEVICE_MODE_KEY);
    set({ deviceOverride: null });
  },

  completeOnboarding: async (mode) => {
    const previousDeviceOverride = get().deviceOverride;
    await SecureStore.deleteItemAsync(DEVICE_MODE_KEY);
    try {
      await mobileApi<PreferencesResponse>("/ui-preferences", {
        method: "PUT",
        body: { displayMode: mode, onboardingCompleted: true },
      });
    } catch (error) {
      if (previousDeviceOverride) {
        await SecureStore.setItemAsync(DEVICE_MODE_KEY, previousDeviceOverride).catch(() => undefined);
      }
      throw error;
    }
    set({ accountMode: mode, deviceOverride: null, onboardingCompleted: true });
  },

  restartOnboarding: async () => {
    await mobileApi<PreferencesResponse>("/ui-preferences", {
      method: "PUT",
      body: { onboardingCompleted: false },
    });
    set({ onboardingCompleted: false });
  },

  reset: () =>
    set({
      accountMode: "standard",
      deviceOverride: null,
      onboardingCompleted: true,
      loading: false,
      loadedForUser: null,
    }),
}));

export function useDisplayMode(): DisplayMode {
  return useUiPreferencesStore((state) => state.deviceOverride ?? state.accountMode);
}
