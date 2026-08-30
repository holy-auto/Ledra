import { NextRequest } from "next/server";
import { resolveMobileCaller } from "@/lib/auth/mobileAuth";
import { hasPermission } from "@/lib/auth/permissions";
import { apiOk, apiUnauthorized, apiForbidden, apiValidationError, apiInternalError } from "@/lib/api/response";
import { logTenantAuditEvent } from "@/lib/audit/tenantLog";

export const dynamic = "force-dynamic";

// ─── POST: Record NFC write event ───
//
// Path param `[id]` は物理NFC UID (hex)。`uid` カラムで検索する。
// PR1 で uid 検索 + prepared 在庫消費を実装済み。本ファイルは
// 「再書込/再アタッチ」ケースの冪等性をさらに強化する。
//
// 動作:
//  1. uid で既存行を検索
//     a. status='written' or 'attached' で同じ certificate_id → 200 (冪等)
//     b. status='prepared' → written へ遷移
//     c. その他 (lost / retired / 異なる cert_id の written) → 422
//  2. uid で見つからない → tenant の prepared 在庫から最古の1件を消費
//  3. 在庫が無ければ 422
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const caller = await resolveMobileCaller(request);
    if (!caller) return apiUnauthorized();
    if (!hasPermission(caller.role, "certificates:edit")) return apiForbidden();

    const { id: physicalUid } = await params;
    if (!physicalUid) {
      return apiValidationError("Physical NFC UID is required");
    }

    const body = (await request.json().catch(() => ({}))) as {
      certificate_id?: string;
    };
    const certificateId = body.certificate_id ?? null;

    // 1) uid で既存行を検索
    const { data: existing } = await caller.supabase
      .from("nfc_tags")
      .select("id, status, certificate_id, uid, written_at, attached_at")
      .eq("uid", physicalUid)
      .eq("tenant_id", caller.tenantId)
      .maybeSingle();

    let tagRowId: string;

    if (existing) {
      // 冪等: 既に written/attached で cert_id 一致 → 現状を返す
      if (
        (existing.status === "written" || existing.status === "attached") &&
        existing.certificate_id === certificateId
      ) {
        return apiOk({
          nfc_tag: {
            id: existing.id,
            status: existing.status,
            certificate_id: existing.certificate_id,
            uid: existing.uid,
            written_at: existing.written_at,
            attached_at: existing.attached_at,
          },
        });
      }

      if (existing.status !== "prepared") {
        return apiValidationError(
          `Cannot write: current status is "${existing.status}", expected "prepared" or matching written/attached`,
        );
      }
      tagRowId = existing.id;
    } else {
      // 2) 在庫から最古の prepared を1件消費
      const { data: spare, error: spareErr } = await caller.supabase
        .from("nfc_tags")
        .select("id")
        .eq("tenant_id", caller.tenantId)
        .eq("status", "prepared")
        .is("uid", null)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (spareErr) return apiInternalError(spareErr, "nfc.write.lookup");
      if (!spare) {
        return apiValidationError("利用可能なNFCタグ在庫がありません。タグを発注してください。");
      }
      tagRowId = spare.id;
    }

    // 3) 状態遷移 prepared → written + uid/certificate_id 紐付け
    const { data, error } = await caller.supabase
      .from("nfc_tags")
      .update({
        status: "written",
        uid: physicalUid,
        certificate_id: certificateId,
        written_at: new Date().toISOString(),
      })
      .eq("id", tagRowId)
      .eq("tenant_id", caller.tenantId)
      .select("id, status, written_at, certificate_id, uid")
      .single();

    if (error) return apiInternalError(error, "nfc.write");

    // Audit log (uuid PK で記録)
    await logTenantAuditEvent(caller.supabase, {
      tenantId: caller.tenantId,
      userId: caller.userId,
      action: "nfc_tag_written",
      table: "nfc_tags",
      recordId: tagRowId,
      req: request,
    });

    return apiOk({ nfc_tag: data });
  } catch (e) {
    return apiInternalError(e, "nfc.write");
  }
}
