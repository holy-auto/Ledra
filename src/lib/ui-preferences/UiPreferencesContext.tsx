"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

export type DisplayMode = "simple" | "standard" | "dense";
export type PreferenceScope = "account" | "device";

const DEVICE_MODE_KEY = "ledra.displayMode.device";

type UiPreferencesContextValue = {
  displayMode: DisplayMode;
  accountMode: DisplayMode;
  deviceOverride: DisplayMode | null;
  onboardingCompleted: boolean;
  loading: boolean;
  setDisplayMode: (mode: DisplayMode, scope?: PreferenceScope) => Promise<void>;
  clearDeviceOverride: () => void;
  completeOnboarding: (mode: DisplayMode) => Promise<void>;
  restartOnboarding: () => Promise<void>;
};

const UiPreferencesContext = createContext<UiPreferencesContextValue | null>(null);

function isDisplayMode(value: unknown): value is DisplayMode {
  return value === "simple" || value === "standard" || value === "dense";
}

export function UiPreferencesProvider({ children }: { children: React.ReactNode }) {
  const [accountMode, setAccountMode] = useState<DisplayMode>("standard");
  const [deviceOverride, setDeviceOverride] = useState<DisplayMode | null>(null);
  const [onboardingCompleted, setOnboardingCompleted] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    try {
      const stored = window.localStorage.getItem(DEVICE_MODE_KEY);
      if (isDisplayMode(stored)) {
        Promise.resolve().then(() => {
          if (!cancelled) setDeviceOverride(stored);
        });
      }
    } catch {
      // Storage is optional. The account preference still works without it.
    }

    fetch("/api/admin/ui-preferences", { cache: "no-store" })
      .then(async (response) => (response.ok ? response.json() : null))
      .then((json) => {
        if (cancelled || !json?.ok) return;
        if (isDisplayMode(json.displayMode)) setAccountMode(json.displayMode);
        setOnboardingCompleted(Boolean(json.onboardingCompleted));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const saveAccountPreference = useCallback(async (displayMode: DisplayMode, completed?: boolean) => {
    const response = await fetch("/api/admin/ui-preferences", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        displayMode,
        ...(completed === undefined ? {} : { onboardingCompleted: completed }),
      }),
    });
    if (!response.ok) throw new Error("表示設定を保存できませんでした");
  }, []);

  const setDisplayMode = useCallback(
    async (mode: DisplayMode, scope: PreferenceScope = "account") => {
      if (scope === "device") {
        setDeviceOverride(mode);
        try {
          window.localStorage.setItem(DEVICE_MODE_KEY, mode);
        } catch {
          // State remains effective for the current session.
        }
        return;
      }

      const previous = accountMode;
      setAccountMode(mode);
      try {
        await saveAccountPreference(mode);
        setDeviceOverride(null);
        try {
          window.localStorage.removeItem(DEVICE_MODE_KEY);
        } catch {
          // The account preference is still saved even when storage is unavailable.
        }
      } catch (error) {
        setAccountMode(previous);
        throw error;
      }
    },
    [accountMode, saveAccountPreference],
  );

  const clearDeviceOverride = useCallback(() => {
    setDeviceOverride(null);
    try {
      window.localStorage.removeItem(DEVICE_MODE_KEY);
    } catch {
      // noop
    }
  }, []);

  const completeOnboarding = useCallback(
    async (mode: DisplayMode) => {
      await saveAccountPreference(mode, true);
      setAccountMode(mode);
      setDeviceOverride(null);
      try {
        window.localStorage.removeItem(DEVICE_MODE_KEY);
      } catch {
        // The account preference is still saved even when storage is unavailable.
      }
      setOnboardingCompleted(true);
    },
    [saveAccountPreference],
  );

  const restartOnboarding = useCallback(async () => {
    await saveAccountPreference(accountMode, false);
    setOnboardingCompleted(false);
  }, [accountMode, saveAccountPreference]);

  const value = useMemo<UiPreferencesContextValue>(
    () => ({
      displayMode: deviceOverride ?? accountMode,
      accountMode,
      deviceOverride,
      onboardingCompleted,
      loading,
      setDisplayMode,
      clearDeviceOverride,
      completeOnboarding,
      restartOnboarding,
    }),
    [
      accountMode,
      clearDeviceOverride,
      completeOnboarding,
      deviceOverride,
      loading,
      onboardingCompleted,
      restartOnboarding,
      setDisplayMode,
    ],
  );

  return <UiPreferencesContext.Provider value={value}>{children}</UiPreferencesContext.Provider>;
}

export function useUiPreferences() {
  const context = useContext(UiPreferencesContext);
  if (!context) throw new Error("useUiPreferences must be used inside UiPreferencesProvider");
  return context;
}
