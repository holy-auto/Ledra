"use client";

import { Suspense } from "react";
import { usePathname } from "next/navigation";
import SupplySidebar from "./SupplySidebar";
import SupplyRouteGuard from "./SupplyRouteGuard";

const AUTH_ROUTES = ["/supply/login", "/supply/register"];

export default function SupplyLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAuthPage = AUTH_ROUTES.some((r) => pathname.startsWith(r));

  if (isAuthPage) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-screen">
      <SupplySidebar />
      <main className="flex-1 p-4 sm:p-6 pt-16 lg:ml-60 lg:pt-6">
        <Suspense fallback={null}>
          <SupplyRouteGuard>{children}</SupplyRouteGuard>
        </Suspense>
      </main>
    </div>
  );
}
