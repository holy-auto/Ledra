"use client";

import { Suspense } from "react";
import { usePathname } from "next/navigation";
import AgentSidebar from "./AgentSidebar";
import AgentRouteGuard from "./AgentRouteGuard";

const AUTH_ROUTES = ["/agent/login"];

export default function AgentLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAuthPage = AUTH_ROUTES.some((r) => pathname.startsWith(r));

  if (isAuthPage) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-screen">
      <AgentSidebar />
      <main className="flex-1 p-6 pt-16 lg:ml-60 lg:pt-6">
        <Suspense fallback={null}>
          <AgentRouteGuard>{children}</AgentRouteGuard>
        </Suspense>
      </main>
    </div>
  );
}
