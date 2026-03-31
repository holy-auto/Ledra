import type { CallerInfo } from "./checkRole";

/**
 * Assert PLATFORM_TENANT_ID is configured.
 * Called at startup (instrumentation) to fail fast on misconfiguration.
 */
export function assertPlatformTenantId(): void {
  const ptid = process.env.PLATFORM_TENANT_ID;
  if (!ptid) {
    console.warn(
      "[security] PLATFORM_TENANT_ID is not set. Platform admin features will be disabled.",
    );
  }
}

/**
 * PLATFORM_TENANT_ID に一致するテナントはLedra運営テナントとみなす。
 */
export function isPlatformTenantId(tenantId: string): boolean {
  const ptid = process.env.PLATFORM_TENANT_ID;
  if (!ptid) {
    console.error("[security] isPlatformTenantId called but PLATFORM_TENANT_ID is not set");
    return false;
  }
  return tenantId === ptid;
}

/**
 * CallerInfo がプラットフォーム管理者（Ledra運営の owner/admin）かどうか判定。
 */
export function isPlatformAdmin(caller: CallerInfo): boolean {
  return (
    isPlatformTenantId(caller.tenantId) &&
    (caller.role === "owner" || caller.role === "admin")
  );
}
