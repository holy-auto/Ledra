import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** 現在ログインユーザーの tenant_id を取得 */
async function resolveCallerTenant(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>) {
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes?.user) return null;

  const { data: mem } = await supabase
    .from("tenant_memberships")
    .select("tenant_id")
    .eq("user_id", userRes.user.id)
    .limit(1)
    .single();

  if (!mem?.tenant_id) return null;

  return {
    userId: userRes.user.id,
    tenantId: mem.tenant_id as string,
  };
}

// ─── GET: 顧客一覧 ───
export async function GET(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerTenant(supabase);
    if (!caller) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const url = new URL(req.url);
    const q = (url.searchParams.get("q") ?? "").trim();

    let query = supabase
      .from("customers")
      .select("*")
      .eq("tenant_id", caller.tenantId)
      .order("created_at", { ascending: false });

    if (q) {
      query = query.or(`name.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%,name_kana.ilike.%${q}%`);
    }

    const { data: customers, error } = await query;
    if (error) return NextResponse.json({ error: "db_error", detail: error.message }, { status: 500 });

    // 各顧客の証明書数を取得
    const customerIds = (customers ?? []).map((c) => c.id);
    let certCounts: Record<string, number> = {};
    let invoiceCounts: Record<string, number> = {};

    if (customerIds.length > 0) {
      const { data: certs } = await supabase
        .from("certificates")
        .select("customer_id")
        .eq("tenant_id", caller.tenantId)
        .in("customer_id", customerIds);

      (certs ?? []).forEach((c) => {
        if (c.customer_id) {
          certCounts[c.customer_id] = (certCounts[c.customer_id] || 0) + 1;
        }
      });

      const { data: invs } = await supabase
        .from("invoices")
        .select("customer_id")
        .eq("tenant_id", caller.tenantId)
        .in("customer_id", customerIds);

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
        total: enriched.length,
        this_month_new: thisMonthNew,
        linked_certificates: totalCerts,
      },
    });
  } catch (e: any) {
    console.error("customers list failed", e);
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 });
  }
}

// ─── POST: 顧客追加 ───
export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerTenant(supabase);
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
    if (error) return NextResponse.json({ error: "insert_failed", detail: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, customer: data });
  } catch (e: any) {
    console.error("customer create failed", e);
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 });
  }
}

// ─── PUT: 顧客更新 ───
export async function PUT(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerTenant(supabase);
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

    if (error) return NextResponse.json({ error: "update_failed", detail: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, customer: data });
  } catch (e: any) {
    console.error("customer update failed", e);
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 });
  }
}

// ─── DELETE: 顧客削除 ───
export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerTenant(supabase);
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
      .from("invoices")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", caller.tenantId)
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

    if (error) return NextResponse.json({ error: "delete_failed", detail: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("customer delete failed", e);
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 });
  }
}
