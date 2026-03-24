import { Suspense } from "react";
import AgentSidebar from "./AgentSidebar";
import AgentRouteGuard from "./AgentRouteGuard";

export default function AgentLayout({ children }: { children: React.ReactNode }) {
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
