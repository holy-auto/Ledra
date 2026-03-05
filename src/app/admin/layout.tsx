import { Suspense } from "react";
import BillingGate from "./BillingGate";
import AdminRouteGuard from "./AdminRouteGuard";
import BillingFetchGuard from "./BillingFetchGuard";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <BillingFetchGuard />
      <BillingGate />
      <Suspense fallback={null}><AdminRouteGuard>{children}</AdminRouteGuard></Suspense>
    </>
  );
}

