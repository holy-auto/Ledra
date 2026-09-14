import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { fetchUserProfile, resolveDefaultStore } from "@/lib/auth";
import { useAuthStore } from "@/stores/authStore";
import { initAppLockState } from "@/stores/appLockStore";

/**
 * アプリ起動時の認証状態初期化
 */
export function useAuthInit() {
  const [isReady, setIsReady] = useState(false);
  const { setUser, setLoading, setSelectedStore } = useAuthStore();

  useEffect(() => {
    let mounted = true;

    async function init() {
      setLoading(true);

      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (session?.user && mounted) {
          const profile = await fetchUserProfile();
          // 店舗の解決は setIsReady(true) より前に済ませる。
          // 先に ready を立てるとオープニング演出が終わってしまい、
          // 消したはずのホップが再び露出する。
          const store = profile?.tenantId
            ? await resolveDefaultStore(profile.tenantId)
            : null;
          if (!mounted) return;
          // 店舗を先に入れる。setUser が isAuthenticated を立てるので、
          // 逆順だと「認証済みだが店舗なし」の状態が一瞬でも観測され得る
          // ((tabs)/_layout はそれを見ると select-store へ飛ばす)。
          setSelectedStore(store);
          setUser(profile);
        } else if (mounted) {
          setUser(null);
        }
      } catch {
        if (mounted) setUser(null);
      } finally {
        if (mounted) {
          // 描画が始まる前にロック状態を確定させる。あとから決めると
          // 1フレームだけ中身が見える
          initAppLockState();
          setIsReady(true);
        }
      }
    }

    init();

    // セッション変更を監視
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return;

      if (event === "SIGNED_IN" && session?.user) {
        const profile = await fetchUserProfile();
        setUser(profile);
      } else if (event === "SIGNED_OUT") {
        setUser(null);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [setUser, setLoading, setSelectedStore]);

  return { isReady };
}
