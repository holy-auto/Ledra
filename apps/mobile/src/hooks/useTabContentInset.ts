import { useSafeAreaInsets } from "react-native-safe-area-context";

import { sizing } from "@/constants/tokens";

/**
 * タブ配下の画面で、スクロール内容の下に空けるべき余白。
 *
 * タブバーは絶対配置で内容の上に浮いているため、内容の最後の行が
 * バーや FAB に隠れる。ホームインジケータ分も端末で変わるので実測値を足す。
 */
export function useTabContentInset() {
  const insets = useSafeAreaInsets();
  return sizing.tabBarClearance + insets.bottom;
}
