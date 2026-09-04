/**
 * POST /api/parts/installations/[id]/reconcile
 *
 * 納品書画像（base64）を AI-OCR で明細化し、装着内容と三方照合・数量突合して
 * 不一致を part_integrity_findings に記録する（L3）。
 * 任意で billed_lines（請求明細）を渡すと請求との突合も行う。
 *
 * 設計: docs/parts-installation-integrity-design.md §4 L3
 */

import { z } from "zod";
import { apiJson, apiInternalError, apiValidationError, apiUnauthorized, apiForbidden } from "@/lib/api/response";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { extractDeliveryNote, toLineItems, type ImageMediaType } from "@/lib/ai/deliveryNoteOcr";
import { reconcileInstallation } from "@/lib/parts/reconcileService";
import type { LineItem } from "@/lib/parts/reconciliation";

export const dynamic = "force-dynamic";

const billedLineSchema = z.object({
  key: z.string().trim().min(1),
  quantity: z.number(),
  amountJpy: z.number().nullable().optional(),
  label: z.string().nullable().optional(),
});

const reconcileSchema = z.object({
  delivery_note_base64: z.string().min(1).optional(),
  media_type: z.enum(["image/jpeg", "image/png", "image/gif", "image/webp"]).optional(),
  /** OCR を介さず直接明細を渡す経路（電子納品データ等）。 */
  delivery_lines: z.array(billedLineSchema).optional(),
  billed_lines: z.array(billedLineSchema).optional(),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createSupabaseServerClient();
  const caller = await resolveCallerWithRole(supabase);
  if (!caller) return apiUnauthorized();
  if (!requireMinRole(caller, "staff")) return apiForbidden();

  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiValidationError("リクエストボディが不正です。");
  }
  const parsed = reconcileSchema.safeParse(body);
  if (!parsed.success) {
    return apiValidationError("入力内容を確認してください。", {
      issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    });
  }

  try {
    let deliveryLines: LineItem[] = (parsed.data.delivery_lines ?? []).map((l) => ({
      key: l.key.toLowerCase(),
      quantity: l.quantity,
      amountJpy: l.amountJpy ?? null,
      label: l.label ?? null,
    }));

    // 画像が渡されたら OCR で明細化して合流
    if (parsed.data.delivery_note_base64 && parsed.data.media_type) {
      // 納品書 OCR は Vision モデルを叩くので呼ぶたびに費用が出る。
      // 画像が渡されたときだけ課金するので、ここで制限する（明細を直接渡す経路は対象外）。
      const limited = await checkRateLimit(req, "ai", `parts-reconcile:${caller.tenantId}`);
      if (limited) return limited;

      const extract = await extractDeliveryNote(
        parsed.data.delivery_note_base64,
        parsed.data.media_type as ImageMediaType,
      );
      deliveryLines = [...deliveryLines, ...toLineItems(extract)];
    }

    const billedLines: LineItem[] = (parsed.data.billed_lines ?? []).map((l) => ({
      key: l.key.toLowerCase(),
      quantity: l.quantity,
      amountJpy: l.amountJpy ?? null,
      label: l.label ?? null,
    }));

    const findings = await reconcileInstallation(caller.tenantId, id, deliveryLines, billedLines);
    return apiJson({ findings, delivery_line_count: deliveryLines.length });
  } catch (e) {
    return apiInternalError(e, "parts/installations/[id]/reconcile POST");
  }
}
