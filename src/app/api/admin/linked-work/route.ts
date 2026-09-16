import { z } from "zod";

import { apiJson, apiValidationError, apiInternalError } from "@/lib/api/response";
import { redeemStaffLinkInvite } from "@/lib/staff/tenantLink";

import { withCaller } from "@/lib/api/withCaller";
export const dynamic = "force-dynamic";

const bodySchema = z.object({ code: z.string().trim().min(4).max(40) });

const REASON_MESSAGE: Record<string, string> = {
  invalid: "コードが違います。発行元にご確認ください。",
  expired: "コードの有効期限が切れています。再発行してもらってください。",
  used: "このコードは既に使われています。再発行してもらってください。",
  self: "自分の店舗が発行したコードは使えません。",
};

/**
 * 外注側: 元請けから渡された連携コードを入力して連携を成立させる。
 *
 * 自テナントを元請けの職人行に紐付ける操作なので、ロスターと同じ members:manage に
 * 揃える（誰でも押せると、スタッフが勝手に取引関係を作れてしまう）。
 */
export const POST = withCaller(
  async (req, { caller }) => {
    try {
      const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
      if (!parsed.success) return apiValidationError("コードを入力してください。");

      const result = await redeemStaffLinkInvite(parsed.data.code, caller.tenantId);
      if (!result.ok) return apiValidationError(REASON_MESSAGE[result.reason] ?? "連携できませんでした。");

      return apiJson({ ok: true, client_name: result.client_name, staff_name: result.staff_name });
    } catch (e: unknown) {
      return apiInternalError(e, "admin/linked-work POST");
    }
  },
  { permission: "members:manage", routeName: "admin/linked-work POST" },
);
