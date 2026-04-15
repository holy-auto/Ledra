import { Suspense } from "react";
import dynamic from "next/dynamic";
import BillingGate from "./BillingGate";
import AdminRouteGuard from "./AdminRouteGuard";
import BillingFetchGuard from "./BillingFetchGuard";
import IdleAutoLogout from "./IdleAutoLogout";
import CommandPalette from "@/components/ui/CommandPalette";
import { ViewModeProvider } from "@/lib/view-mode/ViewModeContext";

const Sidebar = dynamic(() => import("@/components/ui/Sidebar"), {
  loading: () => <div className="hidden lg:block lg:w-60 lg:shrink-0" />,
});

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <ViewModeProvider>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[9999] focus:rounded-md focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:shadow-lg"
      >
        メインコンテンツへスキップ
      </a>
      <BillingFetchGuard />
      <BillingGate />
      <IdleAutoLogout />
      <CommandPalette />
      <div className="flex min-h-screen">
        <Sidebar />
        <main id="main-content" className="flex-1 p-4 sm:p-6 pt-16 lg:ml-60 lg:pt-6">
          <Suspense fallback={null}>
            <AdminRouteGuard>{children}</AdminRouteGuard>
          </Suspense>
        </main>
      </div>
    </ViewModeProvider>
  );
}
