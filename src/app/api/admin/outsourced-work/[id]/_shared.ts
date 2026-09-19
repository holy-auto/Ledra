import { apiError, apiNotFound } from "@/lib/api/response";
import type { ServiceResult } from "@/lib/outsourcedWork/service";

/** service の失敗を HTTP に写す。not_found は存在も教えない（PER-028）。 */
export function serviceFailure(result: Extract<ServiceResult<unknown>, { ok: false }>) {
  if (result.code === "not_found") return apiNotFound(result.message);
  const status = result.code === "forbidden" ? 403 : result.code === "conflict" ? 409 : 400;
  return apiError({
    code: result.code === "validation" ? "validation_error" : result.code,
    message: result.message,
    status,
  });
}
