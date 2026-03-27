import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";

export const dynamic = "force-dynamic";

// ─── GET: 品目一覧 ───
export async function GET(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const url = new URL(req.url);
    const activeOnly = url.searchParams.get("active_only") !== "false";

    let query = supabase
      .from("menu_items")
      .select("id, name, description, unit_price, tax_category, is_active, sort_order, created_at")
      .eq("tenant_id", caller.tenantId)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });

    if (activeOnly) query = query.eq("is_active", true);

    const { data, error } = await query;
    if (error) {
      console.error("[menu-items] db_error:", error.message);
      return NextResponse.json({ error: "db_error" }, { status: 500 });
    }

    const res = NextResponse.json({
      items: data ?? [],
      stats: { total: data?.length ?? 0 },
    });
    res.headers.set("Cache-Control", "private, max-age=60, stale-while-revalidate=120");
    return res;
  } catch (e: any) {
    console.error("[menu-items] GET failed:", e);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

// ─── POST: 品目作成 / CSV一括インポート ───
export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({} as any));

    // CSV一括インポート
    if (body.action === "csv_import" && body.csv) {
      const lines = (body.csv as string)
        .split("\n")
        .map((l: string) => l.trim())
        .filter((l: string) => l && !l.startsWith("品目名")); // ヘッダー行をスキップ

      const rows = lines.map((line: string) => {
        const parts = line.split(",").map((s: string) => s.trim());
        return {
          tenant_id: caller.tenantId,
          name: parts[0] || "",
          description: parts[1] || null,
          unit_price: parseInt(parts[2] || "0", 10) || 0,
          tax_category: parseInt(parts[3] || "10", 10) === 8 ? 8 : 10,
        };
      }).filter((r: any) => r.name);

      if (rows.length === 0) {
        return NextResponse.json({ error: "no_valid_rows", message: "有効な行がありません" }, { status: 400 });
      }

      const { data, error } = await supabase.from("menu_items").insert(rows).select();
      if (error) {
        console.error("[menu-items] insert_failed (csv):", error.message);
        return NextResponse.json({ error: "insert_failed" }, { status: 500 });
      }

      return NextResponse.json({ ok: true, imported: data?.length ?? 0 });
    }

    // 単一作成
    const name = (body.name ?? "").trim();
    if (!name) return NextResponse.json({ error: "name_required", message: "品目名は必須です" }, { status: 400 });

    const row = {
      tenant_id: caller.tenantId,
      name,
      description: (body.description ?? "").trim() || null,
      unit_price: parseInt(String(body.unit_price ?? 0), 10) || 0,
      tax_category: parseInt(String(body.tax_category ?? 10), 10) === 8 ? 8 : 10,
      sort_order: parseInt(String(body.sort_order ?? 0), 10) || 0,
    };

    const { data, error } = await supabase.from("menu_items").insert(row).select().single();
    if (error) {
      console.error("[menu-items] insert_failed:", error.message);
      return NextResponse.json({ error: "insert_failed" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, item: data });
  } catch (e: any) {
    console.error("[menu-items] POST failed:", e);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

// ─── PUT: 品目更新 ───
export async function PUT(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({} as any));
    const id = (body.id ?? "").trim();
    if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 });

    const updates: Record<string, unknown> = {};
    if (body.name !== undefined) updates.name = (body.name ?? "").trim();
    if (body.description !== undefined) updates.description = (body.description ?? "").trim() || null;
    if (body.unit_price !== undefined) updates.unit_price = parseInt(String(body.unit_price), 10) || 0;
    if (body.tax_category !== undefined) updates.tax_category = parseInt(String(body.tax_category), 10) === 8 ? 8 : 10;
    if (body.sort_order !== undefined) updates.sort_order = parseInt(String(body.sort_order), 10) || 0;
    if (body.is_active !== undefined) updates.is_active = !!body.is_active;

    const { data, error } = await supabase
      .from("menu_items")
      .update(updates)
      .eq("id", id)
      .eq("tenant_id", caller.tenantId)
      .select()
      .single();

    if (error) {
      console.error("[menu-items] update_failed:", error.message);
      return NextResponse.json({ error: "update_failed" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, item: data });
  } catch (e: any) {
    console.error("[menu-items] PUT failed:", e);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

// ─── DELETE: 品目論理削除 ───
export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({} as any));
    const id = (body.id ?? "").trim();
    if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 });

    const { error } = await supabase
      .from("menu_items")
      .update({ is_active: false })
      .eq("id", id)
      .eq("tenant_id", caller.tenantId);

    if (error) {
      console.error("[menu-items] delete_failed:", error.message);
      return NextResponse.json({ error: "delete_failed" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("[menu-items] DELETE failed:", e);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
