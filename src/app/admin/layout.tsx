import { Suspense } from "react";
import dynamic from "next/dynamic";
import BillingGate from "./BillingGate";
import AdminRouteGuard from "./AdminRouteGuard";
import BillingFetchGuard from "./BillingFetchGuard";
import IdleAutoLogout from "./IdleAutoLogout";
import CommandPalette from "@/components/ui/CommandPalette";

const Sidebar = dynamic(() => import("@/components/ui/Sidebar"), {
  loading: () => <div className="hidden lg:block lg:w-60 lg:shrink-0" />,
});

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <BillingFetchGuard />
      <BillingGate />
      <IdleAutoLogout />
      <CommandPalette />
      <div className="flex min-h-screen">
        <Sidebar />
        <main className="flex-1 p-4 sm:p-6 pt-16 lg:ml-60 lg:pt-6">
          <Suspense fallback={null}>
            <AdminRouteGuard>{children}</AdminRouteGuard>
          </Suspense>
        </main>
      </div>
    </>
  );
}
