import { useCallback, useEffect, useRef, useState } from "react";
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
import { signOutEverywhere } from "@/lib/signOut";
import { OfflineBanner } from "@/components/OfflineBanner";
import { AppLockGate } from "@/components/AppLockGate";
import { initSentry, setSentryUser } from "@/lib/sentry";
import { useAuthStore } from "@/stores/authStore";
import { useUiPreferencesStore } from "@/stores/uiPreferencesStore";
import { ToastProvider } from "@/components/ToastProvider";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AppIntro } from "@/components/AppIntro";
import { useTapToPayWarmup } from "@/hooks/useTapToPayWarmup";
import { registerForPushNotifications } from "@/lib/push";
import { stackScreenOptions } from "@/components/screenOptions";
import { SPLASH_FAILSAFE_MS } from "@/lib/introTiming";

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

function UiPreferencesGate() {
  const userId = useAuthStore((state) => state.user?.id ?? null);
  const load = useUiPreferencesStore((state) => state.load);
  const reset = useUiPreferencesStore((state) => state.reset);

  useEffect(() => {
    if (userId) void load(userId);
    else reset();
  }, [load, reset, userId]);

  return null;
}

// 401 受信時のグローバルハンドラ: store を初期化して /login へリダイレクト
bindUnauthorizedHandler(async () => {
  await signOutEverywhere();
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
  const [introDone, setIntroDone] = useState(false);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  // 最後の砦: 何があってもスプラッシュを剥がし、**演出も降ろす**。
  //
  // 通常は AppIntro が「動画を描ける状態になってから」剥がし、退場して onFinish を呼ぶ。
  // そこが一切動かなかった場合(例: dev-client のビルドが古く expo-video の
  // ネイティブ側が入っていない)、スプラッシュの裏でアプリが永久に見えなくなる。
  //
  // **剥がすだけでは足りない。** AppIntro の退場は `ready`(useAuthInit の完了)を
  // 条件にしており、初期化が返ってこないと演出の最終フレームのまま固まる
  // ―― スピナーも、エラーも、再試行も無い一枚絵になる。
  // introDone も立てて本体に入れる。初期化が終わっていなければ
  // index.tsx が LoadingScreen(スピナー)を出すので、少なくとも状態が伝わる。
  useEffect(() => {
    const id = setTimeout(() => {
      void SplashScreen.hideAsync().catch(() => {});
      setIntroDone(true);
    }, SPLASH_FAILSAFE_MS);
    return () => clearTimeout(id);
  }, []);

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

  // 起動処理が終わるまでの空白をオープニング演出で埋める。
  // SplashScreen.hideAsync() は AppIntro 側が「動画を描ける状態になってから」呼ぶ。
  //
  // 演出は飾りなので、描画で落ちてもアプリ本体には入れるようにする。
  // **ErrorBoundary で囲むだけでは入れない** ―― 補足するとフォールバック画面が
  // この分岐の中に出るだけで、introDone は false のまま、再試行は同じ物を
  // もう一度マウントするだけになる。補足したら演出は「終わった」ことにして、
  // スプラッシュを剥がして本体へ抜ける。
  if (!introDone) {
    return (
      <ErrorBoundary
        onError={() => {
          void SplashScreen.hideAsync().catch(() => {});
          setIntroDone(true);
        }}
      >
        <AppIntro ready={isReady} onFinish={() => setIntroDone(true)} />
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <StripeTerminalProvider tokenProvider={fetchTokenProvider}>
          <TapToPayWarmupGate />
          <PushRegisterGate />
          <UiPreferencesGate />
          <PaperProvider theme={theme}>
            <ToastProvider>
              <StatusBar style="dark" />
              <OfflineBanner />
              <Stack screenOptions={{ headerShown: false }}>
                <Stack.Screen name="(auth)" />
                {/* legal は利用規約・お問い合わせ等の公開ページなので未認証でも開ける */}
                <Stack.Screen name="legal" options={{ headerShown: false }} />
                {/*
                  D-A3 是正 (2026-09-08): (tabs) 以外のディープリンク（customers/vehicles/
                  certificates/nfc/settings/reservations/work/pos/knowledge/notifications/
                  dashboard）に認証ガードが無く、未認証で開けた。画面側は `user!.tenantId`
                  等を無条件に前提にしているため、開けても TypeError で ErrorBoundary に
                  落ちるだけで「動く」わけではないが、未認証のまま画面のシェルや
                  API 呼び出し（401 前）が走ってしまう。ここで一括りにガードする。
                  (tabs) 自体は (tabs)/_layout.tsx に個別の Redirect ガードも残す
                  (defense-in-depth)。
                */}
                <Stack.Protected guard={isAuthenticated}>
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
                  <Stack.Screen name="knowledge" options={{ headerShown: false }} />
                  {/* Stack を持たない単体画面。ヘッダーを出さないと戻る導線が無くなる */}
                  <Stack.Screen
                    name="notifications"
                    options={{
                      ...stackScreenOptions,
                      headerShown: true,
                      title: "通知",
                    }}
                  />
                  {/* dashboard は画面側で title を設定するのでここでは指定しない */}
                  <Stack.Screen
                    name="dashboard"
                    options={{ ...stackScreenOptions, headerShown: true }}
                  />
                </Stack.Protected>
              </Stack>

              {/* 画面ツリーの最後＝最前面。ロック中は全画面を覆う */}
              <AppLockGate />
            </ToastProvider>
          </PaperProvider>
        </StripeTerminalProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
