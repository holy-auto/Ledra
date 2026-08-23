import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { fetchActiveStores, fetchUserProfile } from "@/lib/auth";
import { pickDefaultStore } from "@/lib/storeSelection";
import { useAuthStore, type StoreInfo } from "@/stores/authStore";

/**
 * 店舗が1つだけのテナントなら、その店舗を起動処理の中で確定させる。
 *
 * これをやらないと、コールドスタートのたびに
 * /(tabs) → /(auth)/select-store → 店舗フェッチ → /(tabs) と画面が2回変わる。
 * ちらつきの実体は select-store のフェッチ時間なので、それを起動処理
 * （オープニング演出が覆っている区間）に前倒しするとホップ自体が消える。
 *
 * 失敗しても起動は止めない。null のままなら select-store に流れるだけで、
 * 挙動はこの変更前と同じになる。
 */
async function resolveDefaultStore(tenantId: string): Promise<StoreInfo | null> {
  try {
    return pickDefaultStore(await fetchActiveStores(tenantId));
  } catch (e) {
    // 起動を止めないための握りつぶしだが、無言だと原因が追えないので残す
    console.warn(
      "resolveDefaultStore failed:",
      e instanceof Error ? e.message : e,
    );
    return null;
  }
}

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
        if (mounted) setIsReady(true);
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
