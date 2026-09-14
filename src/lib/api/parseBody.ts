/**
 * JSON ボディを安全にパースし、zod スキーマで検証するヘルパー。
 *
 * 既存ルートは `await request.json()` を直接呼び、JSON parse 失敗を
 * 握り潰すか、500 で落ちていた (audit report で 23+ ルート指摘)。
 * このヘルパーは parse 失敗・スキーマ違反のいずれも 400 として返す。
 *
 * @example
 * ```ts
 * import { parseJsonBody } from "@/lib/api/parseBody";
 * import { orderCreateSchema } from "@/lib/validations/order";
 *
 * const parsed = await parseJsonBody(request, orderCreateSchema);
 * if (!parsed.ok) return parsed.response;
 * const order = parsed.data; // 完全に typed
 * ```
 */

import type { NextRequest } from "next/server";
import { ZodSchema } from "zod";
import { apiValidationError } from "./response";

export type ParseJsonBodyResult<T> =
  { ok: true; data: T } | { ok: false; response: ReturnType<typeof apiValidationError> };

export async function parseJsonBody<T>(
  request: NextRequest | Request,
  schema: ZodSchema<T>,
): Promise<ParseJsonBodyResult<T>> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return {
      ok: false,
      response: apiValidationError("リクエスト本文を JSON として解釈できません。"),
    };
  }

  const result = schema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues.map((i) => ({
      path: i.path.join("."),
      message: i.message,
    }));
    const first = issues[0];
    const message = first ? first.message : "入力値が不正です。";
    return {
      ok: false,
      response: apiValidationError(message, { issues }),
    };
  }

  return { ok: true, data: result.data };
}
