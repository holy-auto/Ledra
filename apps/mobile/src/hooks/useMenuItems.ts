import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/authStore";

/**
 * 有効な品目の一覧。**予約作成・ウォークイン会計・作業詳細が同じものを使う。**
 *
 * なぜ共有するか: 同じクエリが3箇所に別々のキーで置かれていて、画面を移る
 * たびに取り直し・3つのキャッシュを抱えていた。品目を無効化しても、
 * どの画面のキャッシュが生きているかで見え方が変わる。
 */
export interface MenuItemRow {
  id: string;
  name: string;
  unit_price: number;
  description: string | null;
  category_large: string | null;
  category_medium: string | null;
  category_small: string | null;
}

export function useMenuItems(enabled = true) {
  const user = useAuthStore((s) => s.user);
  return useQuery<MenuItemRow[]>({
    queryKey: ["menu-items", user?.tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("menu_items")
        // 3画面のうち一番広い会計画面に合わせる。狭めると呼び出し側が壊れる
        .select("id, name, unit_price, description, category_large, category_medium, category_small")
        .eq("tenant_id", user!.tenantId)
        .eq("is_active", true)
        .order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user?.tenantId && enabled,
  });
}
