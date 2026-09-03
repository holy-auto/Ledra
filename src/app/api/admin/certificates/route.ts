import { NextRequest } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { parsePagination } from "@/lib/api/pagination";
import { escapeIlike, escapePostgrestValue } from "@/lib/sanitize";
import {
  apiJson,
  apiOk,
  apiUnauthorized,
  apiForbidden,
  apiValidationError,
  apiInternalError,
  apiError,
} from "@/lib/api/response";
import { withIdempotency } from "@/lib/api/idempotency";
import { createCertAction } from "@/app/admin/certificates/new/actions";
import { certCreateJsonSchema, jsonToCertFormData } from "@/lib/certificates/createCertificateApi";
import { recordCertIdempotency } from "@/lib/certificates/idempotencyMap";
import { logger } from "@/lib/logger";

/**
 * `createCertAction` が返す「入力が原因」のエラーコード。
 * ここに無いものは DB 障害などの想定外エラーとして 5xx で返し、オフラインキューに
 * 再送させる。ここに足し忘れると一時障害扱いになり無限に再送されるので、
 * createCertAction に検証を足したらここにも足すこと。
 */
const ACTION_VALIDATION_ERRORS = new Set([
  "customer_name_required",
  "vehicle_required",
  "mileage_required",
  "not_certified_for_manufacturer_template",
]);

export const dynamic = "force-dynamic";

/** GET: テナントの証明書一覧（vehicle_id でフィルタ可能） */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const { searchParams } = new URL(req.url);
    const vehicleId = searchParams.get("vehicle_id");
    const q = (searchParams.get("q") ?? "").trim();
    const includeVehicle = searchParams.get("include_vehicle") === "true";
    const { perPage } = parsePagination(req, { maxPerPage: 200 });

    const baseFields = "id, public_id, status, vehicle_id, customer_id, customer_name, created_at";
    const selectFields = includeVehicle
      ? `${baseFields}, vehicle:vehicles!vehicle_id(id, maker, model, plate_display)`
      : baseFields;

    let query = supabase
      .from("certificates")
      .select(selectFields)
      .eq("tenant_id", caller.tenantId)
      .order("created_at", { ascending: false })
      .limit(perPage);

    if (vehicleId) {
      query = query.eq("vehicle_id", vehicleId);
    }

    if (q) {
      // 証明書ID と顧客名で探す。/admin/certificates の検索欄と同じ範囲。
      //
      // 以前はここに plate_display / vehicle_maker / vehicle_model も並べていたが、
      // **certificates にその3列は無い**（車両はナンバーも車種も vehicle_info_json 側）。
      // PostgREST は存在しない列でフィルタするとクエリごと 400 を返すので、
      // 検索すると一覧が丸ごと空になっていた。車両での検索が要るなら
      // vehicles を !inner で結合するか、json パスで引く形に作り直すこと。
      const safeQ = escapePostgrestValue(escapeIlike(q));
      query = query.or(`public_id.ilike.%${safeQ}%,customer_name.ilike.%${safeQ}%`);
    }

    const { data: certificates, error } = await query;

    if (error) {
      return apiInternalError(error, "admin/certificates GET");
    }

    const headers = { "Cache-Control": "private, max-age=10, stale-while-revalidate=30" };
    return apiJson({ certificates: certificates ?? [] }, { headers });
  } catch (e: unknown) {
    return apiInternalError(e, "admin/certificates GET");
  }
}

/**
 * POST: JSON で証明書を発行する。
 *
 * 既存 Server Action `createCertAction` (FormData 入力) を再利用するための
 * thin adapter。Outbox 経由のオフライン同期と外部連携の入口を兼ねる。
 * `Idempotency-Key` ヘッダ付き再送はサーバ側でリプレイ (Redis ベース、24h TTL)。
 *
 * 認証 / 副作用 (vehicle/customer 自動作成・QStash・フォローアップ等) は
 * createCertAction に集約されている。本ハンドラは JSON ↔ FormData の
 * 変換と idempotency 制御だけを担当する。
 */
export async function POST(req: NextRequest): Promise<Response> {
  // idempotency-key を withIdempotency より前に取得 (handler 内でも参照するため)。
  // 形式チェックは withIdempotency 側でも行う。ここでは生値だけ拾う。
  const rawIdemKey = req.headers.get("idempotency-key") ?? req.headers.get("Idempotency-Key");

  return withIdempotency(req, "admin:cert:create", async () => {
    try {
      const json = await req.json().catch(() => ({}));
      const parsed = certCreateJsonSchema.safeParse(json);
      if (!parsed.success) {
        return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
      }

      // Server Action は認証を内部で行う (auth.getUser + tenant_memberships)。
      // 401 相当は createCertAction が返す "unauthorized" / "no_tenant" で表現される。
      const formData = jsonToCertFormData(parsed.data);
      const result = await createCertAction(formData);
      if (!result.ok) {
        if (result.error === "unauthorized") return apiUnauthorized();
        // 認可は createCertAction 側に置いてある（Web の発行画面も同じ入口を通るため）。
        // ここは翻訳するだけ。権限不足は「サーバの故障」ではないので 500 にはしない。
        // オフラインキューは 403 を再送対象として残す（権限が付与されれば通るため。
        // src/lib/outbox/queue.ts の isPermanentClientError の docstring 参照）。
        if (result.error === "forbidden") return apiForbidden();
        // 入力が原因のもの (再送しても結果が変わらない) と、DB 障害など一時的なものを
        // 分けて返す。両方 400 にすると、オフラインキューが一時障害を恒久失敗と誤判定して
        // 未送信の証明書を止めてしまう (src/lib/outbox/queue.ts の isPermanentClientError)。
        if (ACTION_VALIDATION_ERRORS.has(result.error)) {
          return apiError({ code: "validation_error", message: result.error, status: 422 });
        }
        return apiError({ code: "internal_error", message: result.error, status: 500 });
      }

      // 作成成功時、idempotency-key が指定されていれば永続マッピングを記録する。
      // これでオフライン写真アップロードが (IP/network 変化後でも) public_id を逆引きできる。
      if (rawIdemKey && rawIdemKey.length >= 8) {
        try {
          const supabase = await createSupabaseServerClient();
          const caller = await resolveCallerWithRole(supabase);
          if (caller) {
            const { admin } = createTenantScopedAdmin(caller.tenantId);
            const { data: cert } = await admin
              .from("certificates")
              .select("id, tenant_id")
              .eq("public_id", result.public_id)
              .eq("tenant_id", caller.tenantId)
              .maybeSingle();
            if (cert) {
              await recordCertIdempotency({
                idempotency_key: rawIdemKey,
                tenant_id: cert.tenant_id as string,
                certificate_id: cert.id as string,
                public_id: result.public_id,
              });
            }
          }
        } catch (e) {
          // マッピング記録失敗は本処理を止めない (cert は既に作成済み)。次回再送時の
          // idempotency-key リプレイは Redis 側で機能するので冪等性自体は保たれる。
          logger.warn("admin/certificates POST: idempotency map record failed", {
            err: e instanceof Error ? e.message : String(e),
          });
        }
      }

      return apiOk({ public_id: result.public_id, capture_nonce: result.capture_nonce });
    } catch (e: unknown) {
      return apiInternalError(e, "admin/certificates POST");
    }
  }) as Promise<Response>;
}
