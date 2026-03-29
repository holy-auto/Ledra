"use client";

import { ReactNode, useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const AUTH_ROUTES = ["/insurer/login", "/insurer/forgot-password", "/insurer/reset-password"];

export default function InsurerRouteGuard({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [state, setState] = useState<"loading" | "ok" | "inactive">("loading");
  const [checked, setChecked] = useState(false);

  const isAuthPage = AUTH_ROUTES.some((r) => pathname.startsWith(r));

  useEffect(() => {
    if (isAuthPage) return;
    let cancelled = false;

    (async () => {
      try {
        const supabase = createClient();

        // 1. Check auth session
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          router.replace("/insurer/login");
          return;
        }

        // 2. Check insurer membership
        const { data, error } = await supabase
          .from("insurer_users")
          .select("id, insurer_id, role, is_active")
          .eq("user_id", user.id)
          .eq("is_active", true)
          .maybeSingle();

        if (cancelled) return;

        if (error || !data) {
          router.replace("/insurer/login");
          return;
        }

        setState("ok");
      } catch {
        if (!cancelled) {
          router.replace("/insurer/login");
        }
      } finally {
        if (!cancelled) {
          setChecked(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router, isAuthPage, pathname]);

  // Auth pages — render children directly without guard
  if (isAuthPage) {
    return <>{children}</>;
  }

  // Still loading — show nothing to avoid flash
  if (!checked || state === "loading") {
    return null;
  }

  // Inactive — block access
  if (state === "inactive") {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="glass-card max-w-md p-6 text-center">
          <h2 className="text-lg font-semibold text-primary">アカウントが無効です</h2>
          <p className="mt-2 text-sm text-muted">
            お客様のアカウントは現在無効になっています。管理者にお問い合わせください。
          </p>
          <button
            type="button"
            onClick={async () => {
              try {
                const supabase = createClient();
                await supabase.auth.signOut();
              } catch {
                /* ignore */
              }
              window.location.replace("/insurer/login");
            }}
            className="btn-primary mt-6"
          >
            ログアウト
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
