import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/api/auth";

type RouteContext = { params: Promise<{ id: string }> };

export async function PUT(request: NextRequest, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;
    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const admin = getAdminClient();

    const updates: Record<string, unknown> = {};
    const allowed = ["title", "description", "category_id", "version", "is_pinned", "is_published"];
    for (const key of allowed) {
      if (key in body) updates[key] = body[key];
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "no fields to update" }, { status: 400 });
    }

    const { data, error } = await admin
      .from("agent_materials")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ material: data });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "internal_error" },
      { status: 500 }
    );
  }
}

export async function DELETE(_request: NextRequest, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;
    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const admin = getAdminClient();

    // Get storage path before deleting
    const { data: material } = await admin
      .from("agent_materials")
      .select("storage_path")
      .eq("id", id)
      .single();

    if (material?.storage_path) {
      await admin.storage.from("agent-materials").remove([material.storage_path]);
    }

    const { error } = await admin
      .from("agent_materials")
      .delete()
      .eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "internal_error" },
      { status: 500 }
    );
  }
}
