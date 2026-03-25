import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { fetchUserProfile } from "@/lib/auth";
import { useAuthStore } from "@/stores/authStore";

/**
 * アプリ起動時の認証状態初期化
 */
export function useAuthInit() {
  const [isReady, setIsReady] = useState(false);
  const { setUser, setLoading } = useAuthStore();

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
  }, [setUser, setLoading]);

  return { isReady };
}
