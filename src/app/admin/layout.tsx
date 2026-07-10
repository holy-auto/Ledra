import { Suspense } from "react";
import dynamic from "next/dynamic";
import BillingGate from "./BillingGate";
import AdminRouteGuard from "./AdminRouteGuard";
import BillingFetchGuard from "./BillingFetchGuard";
import DemoTenantBanner from "./DemoTenantBanner";
import IdleAutoLogout from "./IdleAutoLogout";
import HelpFab from "./HelpFab";
import CommandPalette from "@/components/ui/CommandPalette";
import AdminTopBar from "@/components/ui/AdminTopBar";
import AdminPageBar, { PageBarProvider } from "@/components/ui/PageBar";
import NavigationProgress from "@/components/ui/NavigationProgress";
import { ViewModeProvider } from "@/lib/view-mode/ViewModeContext";
import { BusinessModeProvider } from "@/lib/business-mode/BusinessModeContext";
import { ViewerModeProvider } from "@/components/ui/ViewerModeProvider";
// OfflineBanner は SSR 不可。Next 16 では Server Component から
// `dynamic({ ssr: false })` を直接呼べないので、ssr: false 指定を
// クライアント側のラッパーに閉じ込めて経由する。
import OfflineBanner from "@/components/OfflineBannerClient";

const Sidebar = dynamic(() => import("@/components/ui/Sidebar"), {
  loading: () => <div className="hidden lg:block lg:w-60 lg:shrink-0" />,
});

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <ViewModeProvider>
      <BusinessModeProvider>
        <ViewerModeProvider>
          <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[9999] focus:rounded-md focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:shadow-lg"
          >
            メインコンテンツへスキップ
          </a>
          <Suspense fallback={null}>
            <NavigationProgress />
          </Suspense>
          <BillingFetchGuard />
          <BillingGate />
          <DemoTenantBanner />
          <IdleAutoLogout />
          <CommandPalette />
          <HelpFab />
          <OfflineBanner />
          <div className="flex min-h-screen">
            <Sidebar />
            <main className="flex min-h-screen flex-1 flex-col lg:ml-60">
              <PageBarProvider>
                <AdminTopBar />
                <AdminPageBar />
                <div id="main-content" className="flex-1 p-4 pt-6 sm:p-6">
                  <Suspense fallback={null}>
                    <AdminRouteGuard>{children}</AdminRouteGuard>
                  </Suspense>
                </div>
              </PageBarProvider>
            </main>
          </div>
        </ViewerModeProvider>
      </BusinessModeProvider>
    </ViewModeProvider>
  );
}
