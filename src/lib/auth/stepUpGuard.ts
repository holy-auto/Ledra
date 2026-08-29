import type { SupabaseClient } from "@supabase/supabase-js";
import { isAal2Verified } from "./mfa";
import { apiError } from "@/lib/api/response";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any, any, any>;

const SECRET_ADMIN_PREFIXES = [
  "/api/admin/gcal",
  "/api/admin/square",
  "/api/admin/line",
  "/api/admin/email-inbound",
  "/api/admin/tenant/external-api-key",
  "/api/admin/connect/",
  "/api/admin/accounting/",
  "/api/admin/integrations/",
] as const;

// Legacy platform-wide endpoints that predate the /api/admin/platform namespace.
const PLATFORM_ADMIN_PREFIXES = [
  "/api/admin/agent-",
  "/api/admin/agents/",
  "/api/admin/insurers",
  "/api/admin/billing-status",
  "/api/admin/template-orders",
] as const;

/** Central route classification for operations that must never run at AAL1. */
export function requiresAal2ForRequest(pathname: string, method: string): boolean {
  const verb = method.toUpperCase();
  if (pathname.startsWith("/api/admin/platform/")) return true;
  if (PLATFORM_ADMIN_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return true;
  if (
    pathname === "/api/admin/data-export" ||
    pathname === "/api/agent/data-export" ||
    pathname === "/api/insurer/data-export"
  )
    return true;
  if (
    !["GET", "HEAD", "OPTIONS"].includes(verb) &&
    (pathname === "/api/agent/supply/webhook-secret" || pathname === "/api/agent/supply/profile")
  )
    return true;
  const matchesSensitivePrefix = SECRET_ADMIN_PREFIXES.some((prefix) =>
    prefix.endsWith("/") ? pathname.startsWith(prefix) : pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
  if (verb === "GET" || verb === "HEAD" || verb === "OPTIONS") {
    // OAuth callbacks mutate credentials despite using GET.
    return pathname.includes("/callback") && matchesSensitivePrefix;
  }
  return matchesSensitivePrefix;
}

export async function requireAal2OrResponse(supabase: Db): Promise<Response | null> {
  if (await isAal2Verified(supabase)) return null;
  return apiError({
    code: "step_up_required",
    message: "この操作には多要素認証による再認証が必要です。",
    status: 403,
    headers: { "WWW-Authenticate": 'MFA realm="admin", aal="aal2"' },
  });
}
