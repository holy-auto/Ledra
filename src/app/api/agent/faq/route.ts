import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const { data: agentData } = await supabase.rpc("get_my_agent_status");
    const agent = Array.isArray(agentData) ? agentData[0] : agentData;
    if (!agent?.agent_id) return NextResponse.json({ error: "agent_not_found" }, { status: 403 });

    const [catRes, faqRes] = await Promise.all([
      supabase
        .from("agent_faq_categories")
        .select("id, name, slug")
        .order("sort_order", { ascending: true }),
      supabase
        .from("agent_faqs")
        .select("*, agent_faq_categories(name)")
        .eq("is_published", true)
        .order("sort_order", { ascending: true }),
    ]);

    const faqs = (faqRes.data ?? []).map((f: any) => ({
      ...f,
      category_name: f.agent_faq_categories?.name ?? "",
      agent_faq_categories: undefined,
    }));

    const res = NextResponse.json({ categories: catRes.data ?? [], faqs });
    res.headers.set("Cache-Control", "private, max-age=300, stale-while-revalidate=600");
    return res;
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "internal_error" }, { status: 500 });
  }
}
