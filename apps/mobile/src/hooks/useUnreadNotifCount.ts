import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/authStore";

/**
 * 未読通知件数。どの画面のベルにも同じ数字を出すため共有する。
 * user_id IS NULL はテナント全体への通知。
 */
export function useUnreadNotifCount() {
  const { user } = useAuthStore();

  const { data = 0 } = useQuery({
    queryKey: ["notif-unread-count", user?.id],
    queryFn: async () => {
      if (!user?.id) return 0;
      const { count, error } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .or(`user_id.is.null,user_id.eq.${user.id}`)
        .is("read_at", null);
      if (error) return 0;
      return count ?? 0;
    },
    enabled: !!user?.id,
    refetchInterval: 30_000,
  });

  return data;
}
