import { Suspense } from "react";
import BillingGate from "./BillingGate";
import AdminRouteGuard from "./AdminRouteGuard";
import BillingFetchGuard from "./BillingFetchGuard";
import Sidebar from "@/components/ui/Sidebar";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <BillingFetchGuard />
      <BillingGate />
      <div className="flex min-h-screen">
        <Sidebar />
        <main className="flex-1 p-6 pt-16 lg:ml-60 lg:pt-6">
          <Suspense fallback={null}>
            <AdminRouteGuard>{children}</AdminRouteGuard>
          </Suspense>
        </main>
      </div>
    </>
  );
}
