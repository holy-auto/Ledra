import { NextRequest } from "next/server";
import { z } from "zod";
import { resolveMobileCaller } from "@/lib/auth/mobileAuth";
import { requireMinRole } from "@/lib/auth/checkRole";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { nextStatusesFor, type DocType, type DocumentStatus } from "@/types/document";
import { resolveBaseUrl } from "@/lib/url";
import { recordPaymentOnPaid, runDocumentFinalizeEffects } from "@/lib/documents/statusEffects";
import { type SealableDocument } from "@/lib/documents/documentSeal";
import {
  apiOk,
  apiUnauthorized,
  apiForbidden,
  apiValidationError,
  apiNotFound,
  apiInternalError,
} from "@/lib/api/response";

export const dynamic = "force-dynamic";

/**
 * PUT /api/mobile/documents — 帳票のステータス変更のみ。
 *
 * 一覧・詳細の取得はモバイルから Supabase を直読みする（documents に
 * `auth.uid()` を直参照する SELECT ポリシーがあるため）。内容の作成・編集は
 * 採番リトライや明細の再計算が絡むので現場端末では扱わず、管理画面に任せる。
 *
 * 確定 (draft→sent) は電帳法の封印・自動送付・見積フロー進行を伴う。
 * これらは管理画面と同じ src/lib/documents/statusEffects.ts を通す。
 */

const schema = z.object({
  id: z.string().uuid(),
  status: z.enum(["draft", "sent", "accepted", "paid", "overdue", "rejected", "cancelled"]),
  /** 入金済にするときの入金日 (YYYY-MM-DD)。省略時は当日。 */
  payment_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "日付は YYYY-MM-DD 形式で指定してください。")
    .optional(),
});

export async function PUT(request: NextRequest) {
  try {
    const caller = await resolveMobileCaller(request);
    if (!caller) return apiUnauthorized();
    // 他のモバイル書き込みルートと同じ下限。viewer に確定や入金記帳をさせない
    if (!requireMinRole(caller, "staff")) return apiForbidden();

    // 書き込み系の既存プリセット（60回/分）を使う。新しい枠は作らない
    const limited = await checkRateLimit(request, "admin_write", caller.userId);
    if (limited) return limited;

    const parsed = schema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    const { id, status } = parsed.data;

    const { admin } = createTenantScopedAdmin(caller.tenantId);

    const { data: existing, error: readErr } = await admin
      .from("documents")
      .select("id, doc_type, status")
      .eq("id", id)
      .eq("tenant_id", caller.tenantId)
      .maybeSingle();
    // 読み取り失敗を 404 にすると、再試行すれば直る状態を「存在しない」と伝えてしまう
    if (readErr) return apiInternalError(readErr, "mobile documents PUT (read)");
    if (!existing) return apiNotFound("帳票が見つかりません。");

    // 外注請求書（金銭データ）は管理ロール限定。管理画面 PUT と同じ理由
    // （service-role で RLS をバイパスするため API 層でもガードする）。
    if (existing.doc_type === "staff_invoice" && !requireMinRole(caller, "admin")) {
      return apiForbidden("外注請求書の更新は管理者ロールのみ可能です。");
    }

    // 画面が出すボタンと同じ遷移表で弾く。任意のステータスへ飛ばせると
    // 下書きをいきなり入金済にする等、監査の辻褄が合わなくなる。
    const priorStatus = existing.status as DocumentStatus;
    const allowed = nextStatusesFor(existing.doc_type as DocType, priorStatus);
    if (!allowed.includes(status)) {
      return apiValidationError(`このステータスへは変更できません（${priorStatus} → ${status}）。`);
    }

    // documents に更新トリガは無い。管理画面 PUT と同じく明示的に入れないと
    // 封印済みの帳票なのに更新日が作成時のまま残る
    const updates: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
    if (status === "paid") {
      updates.payment_date = parsed.data.payment_date ?? new Date().toISOString().slice(0, 10);
    }

    const { data, error } = await admin
      .from("documents")
      .update(updates)
      .eq("id", id)
      .eq("tenant_id", caller.tenantId)
      // 読んだ時点のステータスを条件に入れる。連打や再送で 2 回確定が走ると
      // 封印と自動送付が二重に動く
      .eq("status", priorStatus)
      // 封印は内容ハッシュを取るので SealableDocument の全項目が要る。
      // 欠けると管理画面で確定した場合と違うハッシュになり、後の照合が通らない。
      .select(
        "id, doc_type, doc_number, status, issued_at, due_date, customer_id, recipient_name, subtotal, tax, total, tax_rate, tax_breakdown, items_json, is_invoice_compliant, payment_date, meta_json, updated_at",
      )
      .maybeSingle();
    if (error) return apiInternalError(error, "mobile documents PUT");
    // 0 行 = 読んでから書くまでに別の遷移が入った
    if (!data) {
      return apiValidationError("他の操作でステータスが変わりました。画面を更新してやり直してください。");
    }

    if (status === "paid" && data) {
      await recordPaymentOnPaid(admin, {
        tenantId: caller.tenantId,
        actorUserId: caller.userId,
        document: {
          id: data.id as string,
          doc_type: data.doc_type as string,
          total: (data.total as number | null) ?? null,
          customer_id: (data.customer_id as string | null) ?? null,
          payment_date: (data.payment_date as string | null) ?? null,
        },
      });
    }

    if (priorStatus === "draft" && data?.status === "sent") {
      runDocumentFinalizeEffects(admin, {
        tenantId: caller.tenantId,
        actorUserId: caller.userId,
        baseUrl: resolveBaseUrl({ req: request }),
        document: data as SealableDocument & { id: string; doc_type: string; meta_json?: unknown },
      });
    }

    return apiOk({ document: data });
  } catch (e) {
    return apiInternalError(e, "mobile documents PUT");
  }
}
