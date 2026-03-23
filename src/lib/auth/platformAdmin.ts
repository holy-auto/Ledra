import type { CallerInfo } from "./checkRole";

/**
 * PLATFORM_TENANT_ID に一致するテナントはCARTRUST運営テナントとみなす。
 */
export function isPlatformTenantId(tenantId: string): boolean {
  const ptid = process.env.PLATFORM_TENANT_ID;
  return !!ptid && tenantId === ptid;
}

/**
 * CallerInfo がプラットフォーム管理者（CARTRUST運営の owner/admin）かどうか判定。
 */
export function isPlatformAdmin(caller: CallerInfo): boolean {
  return (
    isPlatformTenantId(caller.tenantId) &&
    (caller.role === "owner" || caller.role === "admin")
  );
}
