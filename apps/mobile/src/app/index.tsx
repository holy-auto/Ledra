import { Redirect } from "expo-router";
import { useAuthStore } from "@/stores/authStore";
import { LoadingScreen } from "@/components/LoadingScreen";

/**
 * ルートリダイレクト
 * 認証済み → タブ画面、未認証 → ログイン
 */
export default function Index() {
  const { isAuthenticated, isLoading } = useAuthStore();

  if (isLoading) return <LoadingScreen />;

  if (isAuthenticated) {
    return <Redirect href="/(tabs)" />;
  }

  return <Redirect href="/(auth)/login" />;
}
