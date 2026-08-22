import { useCallback, useEffect, useRef } from "react";
import { Stack, router } from "expo-router";
import { PaperProvider } from "react-native-paper";
import { QueryClientProvider } from "@tanstack/react-query";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { StripeTerminalProvider } from "@stripe/stripe-terminal-react-native";

import { theme } from "@/constants/theme";
import { queryClient } from "@/lib/queryClient";
import { useAuthInit } from "@/hooks/useAuthInit";
import { bindUnauthorizedHandler, mobileApi } from "@/lib/api";
import { OfflineBanner } from "@/components/OfflineBanner";
import { initSentry, setSentryUser } from "@/lib/sentry";
import { useAuthStore } from "@/stores/authStore";
import { ToastProvider } from "@/components/ToastProvider";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { useTapToPayWarmup } from "@/hooks/useTapToPayWarmup";
import { registerForPushNotifications } from "@/lib/push";
import { stackScreenOptions } from "@/components/screenOptions";

SplashScreen.preventAutoHideAsync();

/**
 * useTapToPayWarmup は useStripeTerminal を内部で呼ぶため
 * StripeTerminalProvider の内側で動かす必要がある。
 * 表示要素は持たず副作用のみ。
 */
function TapToPayWarmupGate() {
  useTapToPayWarmup();
  return null;
}

/**
 * 認証完了後に一度だけ push トークンを登録する（要件 3.3 の配信基盤）。
 * ログアウトでリセットし、次回ログイン時に再登録する。
 */
function PushRegisterGate() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const done = useRef(false);
  useEffect(() => {
    if (isAuthenticated && !done.current) {
      done.current = true;
      void registerForPushNotifications();
    }
    if (!isAuthenticated) {
      done.current = false;
    }
  }, [isAuthenticated]);
  return null;
}

// 401 受信時のグローバルハンドラ: store を初期化して /login へリダイレクト
bindUnauthorizedHandler(() => {
  useAuthStore.getState().reset();
  router.replace("/(auth)/login");
});

// 起動時に1回だけ Sentry を初期化 (DSN/パッケージ未設定なら no-op)
initSentry();

// authStore と Sentry の user タグを連動 (ログイン/ログアウトを反映)
useAuthStore.subscribe((state) => {
  setSentryUser(
    state.user ? { id: state.user.id, tenantId: state.user.tenantId } : null
  );
});

export default function RootLayout() {
  const { isReady } = useAuthInit();

  useEffect(() => {
    if (isReady) {
      SplashScreen.hideAsync();
    }
  }, [isReady]);

  // Stripe Terminal の connection token 取得
  // SDK 0.0.1-beta.29 では initialize() 経由ではなく Provider 経由で渡す
  // API側は POST のみ受付なので必ず POST で叩く
  const fetchTokenProvider = useCallback(async () => {
    const res = await mobileApi<{ secret: string }>(
      "/pos/terminal/connection-token",
      { method: "POST" }
    );
    return res.secret;
  }, []);

  if (!isReady) return null;

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <StripeTerminalProvider tokenProvider={fetchTokenProvider}>
          <TapToPayWarmupGate />
          <PushRegisterGate />
          <PaperProvider theme={theme}>
            <ToastProvider>
              <StatusBar style="dark" />
              <OfflineBanner />
              <Stack screenOptions={{ headerShown: false }}>
                <Stack.Screen name="(auth)" />
                <Stack.Screen name="(tabs)" />
                <Stack.Screen
                  name="customers"
                  options={{ headerShown: false }}
                />
                <Stack.Screen
                  name="vehicles"
                  options={{ headerShown: false }}
                />
                <Stack.Screen
                  name="certificates"
                  options={{ headerShown: false }}
                />
                <Stack.Screen name="nfc" options={{ headerShown: false }} />
                <Stack.Screen
                  name="settings"
                  options={{ headerShown: false }}
                />
                <Stack.Screen
                  name="reservations"
                  options={{ headerShown: false }}
                />
                <Stack.Screen name="work" options={{ headerShown: false }} />
                <Stack.Screen name="pos" options={{ headerShown: false }} />
                {/* Stack を持たない単体画面。ヘッダーを出さないと戻る導線が無くなる */}
                <Stack.Screen
                  name="notifications"
                  options={{
                    ...stackScreenOptions,
                    headerShown: true,
                    title: "通知",
                  }}
                />
                <Stack.Screen
                  name="dashboard"
                  options={{
                    ...stackScreenOptions,
                    headerShown: true,
                    title: "ダッシュボード",
                  }}
                />
              </Stack>
            </ToastProvider>
          </PaperProvider>
        </StripeTerminalProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
