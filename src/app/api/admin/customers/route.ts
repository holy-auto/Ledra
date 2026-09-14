import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { resolveCallerWithRole, requirePermission } from "@/lib/auth/checkRole";
import { escapeIlike } from "@/lib/sanitize";
import { enforceBilling } from "@/lib/billing/guard";
import { parsePagination } from "@/lib/api/pagination";
import { apiJson, apiUnauthorized, apiValidationError, apiInternalError, apiForbidden } from "@/lib/api/response";
import { customerCreateSchema, customerDeleteSchema, customerUpdateSchema } from "@/lib/validations/customer";
import { emitEntityWebhook } from "@/lib/outbound-webhooks";

export const dynamic = "force-dynamic";

// ─── GET: 顧客一覧 ───
export async function GET(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const url = new URL(req.url);
    const q = (url.searchParams.get("q") ?? "").trim();
    const idParam = (url.searchParams.get("id") ?? "").trim();
    const { page, perPage, from, to } = parsePagination(req, { maxPerPage: 200 });

    // Count query for pagination metadata
    let countQuery = supabase
      .from("customers")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", caller.tenantId);

    let query = supabase
      .from("customers")
      // tenant_id は `.eq("tenant_id", caller.tenantId)` でフィルタするのみ。
      // caller は既に自テナント下で認証されているので response body に
      // 含める必要はなく、外す (see `redactScopeIds`).
      .select(
        "id, name, name_kana, email, phone, line_user_id, postal_code, address, note, customer_type, billing_cycle, billing_terms_note, closing_day, payment_terms_days, linked_tenant_id, corporate_number, invoice_registration_number, short_name, honorific, transfer_fee_payer, document_delivery_method, nda_status, basic_contract_status, created_at, updated_at",
      )
      .eq("tenant_id", caller.tenantId)
      .order("created_at", { ascending: false });

    // id 指定時は単一顧客の直接取得（例: 送付モーダルの連絡先補完）のため、
    // ページネーション件数や証明書/請求書の集計は不要 — 後続のカウント系クエリを丸ごとスキップする。
    const isSingleIdLookup = !!idParam;
    if (idParam) {
      query = query.eq("id", idParam);
    }

    if (q) {
      const sq = escapeIlike(q);
      const filter = `name.ilike.%${sq}%,email.ilike.%${sq}%,phone.ilike.%${sq}%,name_kana.ilike.%${sq}%`;
      query = query.or(filter);
      countQuery = countQuery.or(filter);
    }

    // Apply pagination if page param is provided
    if (page > 0) {
      query = query.range(from, to);
    }

    const [{ data: customers, error }, { count: totalCount }] = await Promise.all([
      query,
      isSingleIdLookup ? Promise.resolve({ count: null }) : countQuery,
    ]);
    if (error) {
      return apiInternalError(error, "customers GET");
    }

    // 各顧客の証明書数・請求書数を並列で取得（customer_idのみselectしてカウント）
    const customerIds = (customers ?? []).map((c) => c.id);
    const certCounts: Record<string, number> = {};
    const invoiceCounts: Record<string, number> = {};

    if (customerIds.length > 0 && !isSingleIdLookup) {
      const [{ data: certs }, { data: invs }] = await Promise.all([
        supabase
          .from("certificates")
          .select("customer_id", { count: "planned" })
          .eq("tenant_id", caller.tenantId)
          .in("customer_id", customerIds),
        supabase
          .from("documents")
          .select("customer_id", { count: "planned" })
          .eq("tenant_id", caller.tenantId)
          .in("doc_type", ["invoice", "consolidated_invoice"])
          .in("customer_id", customerIds),
      ]);

      (certs ?? []).forEach((c) => {
        if (c.customer_id) {
          certCounts[c.customer_id] = (certCounts[c.customer_id] || 0) + 1;
        }
      });

      (invs ?? []).forEach((inv) => {
        if (inv.customer_id) {
          invoiceCounts[inv.customer_id] = (invoiceCounts[inv.customer_id] || 0) + 1;
        }
      });
    }

    const enriched = (customers ?? []).map((c) => ({
      ...c,
      certificates_count: certCounts[c.id] || 0,
      invoices_count: invoiceCounts[c.id] || 0,
    }));

    // 統計
    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const thisMonthNew = enriched.filter((c) => c.created_at >= thisMonthStart).length;
    const totalCerts = Object.values(certCounts).reduce((a, b) => a + b, 0);

    const headers = { "Cache-Control": "private, max-age=10, stale-while-revalidate=30" };
    return apiJson(
      {
        customers: enriched,
        stats: {
          total: totalCount ?? enriched.length,
          this_month_new: thisMonthNew,
          linked_certificates: totalCerts,
        },
        ...(page > 0 && {
          pagination: {
            page,
            per_page: perPage,
            total: totalCount ?? enriched.length,
            total_pages: Math.ceil((totalCount ?? enriched.length) / perPage),
          },
        }),
      },
      { headers },
    );
  } catch (e) {
    return apiInternalError(e, "customers GET");
  }
}

// ─── POST: 顧客追加 ───
export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requirePermission(caller, "customers:create")) return apiForbidden();

    const deny = await enforceBilling(req, {
      minPlan: "free",
      action: "customer_create",
      tenantId: caller.tenantId,
    });
    if (deny) return deny;

    const parsed = customerCreateSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }

    const row = {
      id: crypto.randomUUID(),
      tenant_id: caller.tenantId,
      ...parsed.data,
    };

    // RLS をバイパスしてサービスロールで INSERT（tenant_id で必ずスコープ限定）
    const { admin } = createTenantScopedAdmin(caller.tenantId);
    const { data, error } = await admin
      .from("customers")
      .insert(row)
      .select(
        "id, tenant_id, name, name_kana, email, phone, postal_code, address, note, customer_type, billing_cycle, billing_terms_note, closing_day, payment_terms_days, linked_tenant_id, corporate_number, invoice_registration_number, short_name, honorific, transfer_fee_payer, document_delivery_method, nda_status, basic_contract_status, created_at, updated_at",
      )
      .single();
    if (error) {
      return apiInternalError(error, "customers POST");
    }

    await emitEntityWebhook(caller.tenantId, "customer.created", data.id, {
      id: data.id,
      name: data.name,
      email: data.email,
      phone: data.phone,
    });

    return apiJson({ ok: true, customer: data });
  } catch (e) {
    return apiInternalError(e, "customers POST");
  }
}

// ─── PUT: 顧客更新 ───
export async function PUT(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requirePermission(caller, "customers:edit")) return apiForbidden();

    const deny = await enforceBilling(req, {
      minPlan: "free",
      action: "customer_update",
      tenantId: caller.tenantId,
    });
    if (deny) return deny;

    const parsed = customerUpdateSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }
    const { id, ...fields } = parsed.data;

    const updates = {
      ...fields,
      updated_at: new Date().toISOString(),
    };

    // RLS をバイパスしてサービスロールで UPDATE（tenant_id で必ずスコープ限定）
    const { admin } = createTenantScopedAdmin(caller.tenantId);
    const { data, error } = await admin
      .from("customers")
      .update(updates)
      .eq("id", id)
      .eq("tenant_id", caller.tenantId)
      .select(
        "id, tenant_id, name, name_kana, email, phone, postal_code, address, note, customer_type, billing_cycle, billing_terms_note, closing_day, payment_terms_days, linked_tenant_id, corporate_number, invoice_registration_number, short_name, honorific, transfer_fee_payer, document_delivery_method, nda_status, basic_contract_status, created_at, updated_at",
      )
      .single();

    if (error) {
      return apiInternalError(error, "customers PUT");
    }

    // 双方向反映: 紐付き車両の updated_at も同期更新
    try {
      const { count } = await admin
        .from("vehicles")
        .select("id", { count: "exact", head: true })
        .eq("customer_id", id)
        .eq("tenant_id", caller.tenantId);

      if (count && count > 0) {
        await admin
          .from("vehicles")
          .update({ updated_at: new Date().toISOString() })
          .eq("customer_id", id)
          .eq("tenant_id", caller.tenantId);
      }
    } catch (syncErr) {
      // 同期失敗はログのみ（顧客更新自体は成功扱い）
      console.warn("[customers] vehicle sync warning:", syncErr);
    }

    await emitEntityWebhook(caller.tenantId, "customer.updated", data.id, {
      id: data.id,
      name: data.name,
      email: data.email,
      phone: data.phone,
    });

    return apiJson({ ok: true, customer: data });
  } catch (e) {
    return apiInternalError(e, "customers PUT");
  }
}

// ─── DELETE: 顧客削除 ───
export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    // 削除は admin 以上（代表判断 2026-09-04）。顧客には施工履歴・証明書がぶら下がる不可逆操作なので、
    // 作成・編集（staff）とは分ける。
    if (!requirePermission(caller, "customers:delete")) return apiForbidden();

    const deny = await enforceBilling(req, {
      minPlan: "free",
      action: "customer_delete",
      tenantId: caller.tenantId,
    });
    if (deny) return deny;

    const parsed = customerDeleteSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }
    const { id } = parsed.data;

    // RLS をバイパスしてサービスロールで操作（tenant_id で必ずスコープ限定）
    const { admin } = createTenantScopedAdmin(caller.tenantId);

    // 紐付くデータがあると外部キー制約 (ON DELETE: 無指定 = RESTRICT) で
    // 削除が失敗するため、事前に件数を確認して分かりやすいメッセージを返す。
    // 対象は ON DELETE 制約が RESTRICT のテーブル: 証明書 / 帳票 / 予約。
    const [{ count: certCount }, { count: docCount }, { count: reservationCount }] = await Promise.all([
      admin
        .from("certificates")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", caller.tenantId)
        .eq("customer_id", id),
      admin
        .from("documents")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", caller.tenantId)
        .eq("customer_id", id),
      admin
        .from("reservations")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", caller.tenantId)
        .eq("customer_id", id),
    ]);

    const blockers: string[] = [];
    if ((certCount ?? 0) > 0) blockers.push(`証明書${certCount}件`);
    if ((docCount ?? 0) > 0) blockers.push(`帳票${docCount}件`);
    if ((reservationCount ?? 0) > 0) blockers.push(`予約${reservationCount}件`);

    if (blockers.length > 0) {
      return apiValidationError(
        `この顧客には${blockers.join("・")}が紐付いているため削除できません。先に紐付くデータを削除または別の顧客へ移してください。`,
      );
    }

    const { error } = await admin.from("customers").delete().eq("id", id).eq("tenant_id", caller.tenantId);

    if (error) {
      // 事前チェックで捕捉できなかった外部キー制約違反 (Postgres 23503) は
      // サーバーエラー扱いにせず、紐付くデータがある旨を返す。
      if ((error as { code?: string }).code === "23503") {
        return apiValidationError(
          "この顧客には紐付くデータがあるため削除できません。先に紐付くデータを削除または別の顧客へ移してください。",
        );
      }
      return apiInternalError(error, "customers DELETE");
    }

    return apiJson({ ok: true });
  } catch (e) {
    return apiInternalError(e, "customers DELETE");
  }
}
