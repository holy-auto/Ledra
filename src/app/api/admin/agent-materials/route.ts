import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/api/auth";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import { apiUnauthorized, apiForbidden, apiInternalError, apiValidationError } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rateLimit";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const limited = await checkRateLimit(req, "general");
  if (limited) return limited;

  try {
    const supabase = await createClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "admin")) return apiForbidden();

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
    return apiInternalError(e, "agent-materials GET");
  }
}

export async function POST(request: NextRequest) {
  const limited = await checkRateLimit(request, "general");
  if (limited) return limited;

  try {
    const supabase = await createClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "admin")) return apiForbidden();

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const title = formData.get("title") as string | null;
    const categoryId = formData.get("category_id") as string | null;
    const description = formData.get("description") as string | null;
    const version = formData.get("version") as string | null;
    const isPinned = formData.get("is_pinned") === "true";

    if (!file || !title || !categoryId) {
      return apiValidationError("file, title, and category_id are required");
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
      return apiInternalError(uploadErr, "agent-materials upload");
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
        uploaded_by: caller.userId,
      })
      .select()
      .single();

    if (insertErr) {
      return apiInternalError(insertErr, "agent-materials insert");
    }

    return NextResponse.json({ material }, { status: 201 });
  } catch (e) {
    return apiInternalError(e, "agent-materials POST");
  }
}
