import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { escapeIlike } from "@/lib/sanitize";

export const dynamic = "force-dynamic";

// ─── GET: 顧客一覧 ───
export async function GET(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const url = new URL(req.url);
    const q = (url.searchParams.get("q") ?? "").trim();
    const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "0", 10) || 0);
    const perPage = Math.min(200, Math.max(1, parseInt(url.searchParams.get("per_page") ?? "50", 10)));

    // Count query for pagination metadata
    let countQuery = supabase
      .from("customers")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", caller.tenantId);

    let query = supabase
      .from("customers")
      .select("*")
      .eq("tenant_id", caller.tenantId)
      .order("created_at", { ascending: false });

    if (q) {
      const sq = escapeIlike(q);
      const filter = `name.ilike.%${sq}%,email.ilike.%${sq}%,phone.ilike.%${sq}%,name_kana.ilike.%${sq}%`;
      query = query.or(filter);
      countQuery = countQuery.or(filter);
    }

    // Apply pagination if page param is provided
    if (page > 0) {
      const from = (page - 1) * perPage;
      const to = from + perPage - 1;
      query = query.range(from, to);
    }

    const [{ data: customers, error }, { count: totalCount }] = await Promise.all([query, countQuery]);
    if (error) {
      console.error("[customers] db_error:", error.message);
      return NextResponse.json({ error: "db_error" }, { status: 500 });
    }

    // 各顧客の証明書数・請求書数を並列で取得（customer_idのみselectしてカウント）
    const customerIds = (customers ?? []).map((c) => c.id);
    let certCounts: Record<string, number> = {};
    let invoiceCounts: Record<string, number> = {};

    if (customerIds.length > 0) {
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

    return NextResponse.json({
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
    });
  } catch (e: any) {
    console.error("customers list failed", e);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

// ─── POST: 顧客追加 ───
export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({} as any));
    const name = (body?.name ?? "").trim();
    if (!name) return NextResponse.json({ error: "name_required", message: "顧客名は必須です。" }, { status: 400 });

    const row = {
      id: crypto.randomUUID(),
      tenant_id: caller.tenantId,
      name,
      name_kana: (body?.name_kana ?? "").trim() || null,
      email: (body?.email ?? "").trim() || null,
      phone: (body?.phone ?? "").trim() || null,
      postal_code: (body?.postal_code ?? "").trim() || null,
      address: (body?.address ?? "").trim() || null,
      note: (body?.note ?? "").trim() || null,
    };

    const { data, error } = await supabase.from("customers").insert(row).select().single();
    if (error) {
      console.error("[customers] insert_failed:", error.message);
      return NextResponse.json({ error: "insert_failed" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, customer: data });
  } catch (e: any) {
    console.error("customer create failed", e);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

// ─── PUT: 顧客更新 ───
export async function PUT(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({} as any));
    const id = (body?.id ?? "").trim();
    if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 });

    const name = (body?.name ?? "").trim();
    if (!name) return NextResponse.json({ error: "name_required", message: "顧客名は必須です。" }, { status: 400 });

    const updates: Record<string, unknown> = {
      name,
      name_kana: (body?.name_kana ?? "").trim() || null,
      email: (body?.email ?? "").trim() || null,
      phone: (body?.phone ?? "").trim() || null,
      postal_code: (body?.postal_code ?? "").trim() || null,
      address: (body?.address ?? "").trim() || null,
      note: (body?.note ?? "").trim() || null,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("customers")
      .update(updates)
      .eq("id", id)
      .eq("tenant_id", caller.tenantId)
      .select()
      .single();

    if (error) {
      console.error("[customers] update_failed:", error.message);
      return NextResponse.json({ error: "update_failed" }, { status: 500 });
    }

    // 双方向反映: 紐付き車両の customer_name も同期更新
    try {
      const { count } = await supabase
        .from("vehicles")
        .select("id", { count: "exact", head: true })
        .eq("customer_id", id)
        .eq("tenant_id", caller.tenantId);

      if (count && count > 0) {
        await supabase
          .from("vehicles")
          .update({ updated_at: new Date().toISOString() })
          .eq("customer_id", id)
          .eq("tenant_id", caller.tenantId);
      }
    } catch (syncErr) {
      // 同期失敗はログのみ（顧客更新自体は成功扱い）
      console.warn("[customers] vehicle sync warning:", syncErr);
    }

    return NextResponse.json({ ok: true, customer: data });
  } catch (e: any) {
    console.error("customer update failed", e);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

// ─── DELETE: 顧客削除 ───
export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({} as any));
    const id = (body?.id ?? "").trim();
    if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 });

    // リンク済み証明書/請求書があるか確認
    const { count: certCount } = await supabase
      .from("certificates")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", caller.tenantId)
      .eq("customer_id", id);

    const { count: invCount } = await supabase
      .from("documents")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", caller.tenantId)
      .in("doc_type", ["invoice", "consolidated_invoice"])
      .eq("customer_id", id);

    if ((certCount ?? 0) > 0 || (invCount ?? 0) > 0) {
      return NextResponse.json({
        error: "has_linked_records",
        message: "この顧客には証明書または請求書が紐付いているため削除できません。",
      }, { status: 400 });
    }

    const { error } = await supabase
      .from("customers")
      .delete()
      .eq("id", id)
      .eq("tenant_id", caller.tenantId);

    if (error) {
      console.error("[customers] delete_failed:", error.message);
      return NextResponse.json({ error: "delete_failed" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("customer delete failed", e);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
