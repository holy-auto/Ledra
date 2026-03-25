import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    // Verify agent membership
    const { data: agentStatus } = await supabase.rpc("get_my_agent_status");
    if (!agentStatus || (Array.isArray(agentStatus) && agentStatus.length === 0)) {
      return NextResponse.json({ error: "not_agent" }, { status: 403 });
    }

    // Fetch categories
    const { data: categories } = await supabase
      .from("agent_material_categories")
      .select("id, name, slug, description")
      .order("sort_order", { ascending: true });

    // Fetch published materials with category name
    const { data: materials } = await supabase
      .from("agent_materials")
      .select(`
        id, category_id, title, description, file_name, file_size, file_type,
        version, is_pinned, download_count, created_at, updated_at,
        agent_material_categories ( name )
      `)
      .eq("is_published", true)
      .order("is_pinned", { ascending: false })
      .order("created_at", { ascending: false });

    const enriched = (materials ?? []).map((m: any) => ({
      ...m,
      category_name: m.agent_material_categories?.name ?? "",
      agent_material_categories: undefined,
    }));

    return NextResponse.json({
      categories: categories ?? [],
      materials: enriched,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "internal_error" },
      { status: 500 }
    );
  }
}
