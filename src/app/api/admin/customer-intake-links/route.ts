/**
 * /api/admin/customer-intake-links
 *
 * 店舗用 顧客登録リンク (繰り返し使える固定 URL/QR) の管理.
 * - GET: 一覧 (tenant スコープ)
 * - POST: 新規発行. 戻り値に URL + raw token を含む (**raw token はこのレスポンス以外には現れない**).
 */

import { z } from "zod";

import { apiOk, apiValidationError, apiInternalError, apiForbidden } from "@/lib/api/response";

import { hasPermission } from "@/lib/auth/permissions";
import { createStoreLink, listStoreLinks } from "@/lib/identity/intakeLinkServer";
import { storeErrorMessage } from "@/lib/stores/resolveStoreId";
import { containsMyNumber } from "@/lib/identity/ocrFilter";

import { withCaller } from "@/lib/api/withCaller";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CreateSchema = z.object({
  store_id: z.string().uuid().optional().nullable(),
  label: z.string().max(100).optional().nullable(),
});

export const GET = withCaller(
  async (req, { caller }) => {
    if (!hasPermission(caller.role, "customers:view")) return apiForbidden();

    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL ?? `${req.nextUrl.protocol}//${req.nextUrl.host}`;

    try {
      const links = await listStoreLinks(caller.tenantId, baseUrl);
      return apiOk({ links });
    } catch (err) {
      return apiInternalError(err, "GET /api/admin/customer-intake-links");
    }
  },
  { rateLimit: "general", routeName: "GET /api/admin/customer-intake-links" },
);

export const POST = withCaller(
  async (req, { caller }) => {
    if (!hasPermission(caller.role, "customers:create")) return apiForbidden();

    const body = await req.json().catch(() => null);
    const parsed = CreateSchema.safeParse(body ?? {});
    if (!parsed.success) {
      return apiValidationError("入力内容が不正です: " + parsed.error.issues.map((i) => i.message).join(", "));
    }
    if (parsed.data.label && containsMyNumber(parsed.data.label)) {
      return apiValidationError("ラベルに個人番号は使えません");
    }

    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL ?? `${req.nextUrl.protocol}//${req.nextUrl.host}`;

    try {
      const result = await createStoreLink({
        tenantId: caller.tenantId,
        storeId: parsed.data.store_id ?? null,
        label: parsed.data.label ?? null,
        createdBy: caller.userId,
        baseUrl,
      });
      return apiOk({
        id: result.id,
        short_id: result.shortId,
        url: result.url,
      });
    } catch (err) {
      // 店舗の指定が通らなかったのは入力の問題（消された店舗・他テナントの ID）。
      // 500 で返すと画面に何も出せず、監視にもサーバ障害として積み上がる
      const storeMessage = storeErrorMessage(err);
      if (storeMessage) return apiValidationError(storeMessage);
      return apiInternalError(err, "POST /api/admin/customer-intake-links");
    }
  },
  { rateLimit: "admin_write", routeName: "admin/customer-intake-links POST" },
);
