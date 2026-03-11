import type { ReactNode } from "react";
import { MarketingHeader } from "@/components/marketing/layout/MarketingHeader";
import { MarketingFooter } from "@/components/marketing/layout/MarketingFooter";

/**
 * マーケティングサイト共通レイアウト
 *
 * このレイアウトは (marketing) ルートグループ配下のページにのみ適用される。
 * /admin, /insurer, /customer などの既存アプリルートには影響しない。
 */
export default function MarketingLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <MarketingHeader />
      <main className="flex-1">{children}</main>
      <MarketingFooter />
    </div>
  );
}
