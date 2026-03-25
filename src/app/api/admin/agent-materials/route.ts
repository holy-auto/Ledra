import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/api/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const admin = getAdminClient();

    const [catResult, matResult] = await Promise.all([
      admin
        .from("agent_material_categories")
        .select("*")
        .order("sort_order", { ascending: true }),
      admin
        .from("agent_materials")
        .select(`
          *, agent_material_categories ( name )
        `)
        .order("created_at", { ascending: false }),
    ]);

    const materials = (matResult.data ?? []).map((m: any) => ({
      ...m,
      category_name: m.agent_material_categories?.name ?? "",
      agent_material_categories: undefined,
    }));

    return NextResponse.json({
      categories: catResult.data ?? [],
      materials,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "internal_error" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const title = formData.get("title") as string | null;
    const categoryId = formData.get("category_id") as string | null;
    const description = formData.get("description") as string | null;
    const version = formData.get("version") as string | null;
    const isPinned = formData.get("is_pinned") === "true";

    if (!file || !title || !categoryId) {
      return NextResponse.json(
        { error: "file, title, and category_id are required" },
        { status: 400 }
      );
    }

    // Upload to Supabase Storage
    const timestamp = Date.now();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storagePath = `materials/${timestamp}_${safeName}`;

    const admin = getAdminClient();
    const { error: uploadErr } = await admin.storage
      .from("agent-materials")
      .upload(storagePath, file, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadErr) {
      return NextResponse.json({ error: uploadErr.message }, { status: 500 });
    }

    // Insert record
    const { data: material, error: insertErr } = await admin
      .from("agent_materials")
      .insert({
        category_id: categoryId,
        title,
        description: description || null,
        file_name: file.name,
        file_size: file.size,
        file_type: file.type,
        storage_path: storagePath,
        version: version || null,
        is_pinned: isPinned,
        is_published: true,
        uploaded_by: auth.user.id,
      })
      .select()
      .single();

    if (insertErr) {
      return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }

    return NextResponse.json({ material }, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "internal_error" },
      { status: 500 }
    );
  }
}
