import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { apiJson, apiUnauthorized, apiForbidden, apiInternalError } from "@/lib/api/response";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return apiUnauthorized();

    const { data: agentData } = await supabase.rpc("get_my_agent_status");
    const agent = Array.isArray(agentData) ? agentData[0] : agentData;
    if (!agent?.agent_id) return apiForbidden("agent_not_found");

    const [catRes, faqRes] = await Promise.all([
      supabase
        .from("agent_faq_categories")
        .select("id, name, slug, sort_order, created_at")
        .order("sort_order", { ascending: true }),
      supabase
        .from("agent_faqs")
        .select(
          "id, category_id, question, answer, sort_order, is_published, created_at, updated_at, agent_faq_categories(name)",
        )
        .eq("is_published", true)
        .order("sort_order", { ascending: true }),
    ]);

    const faqs = (faqRes.data ?? []).map((f: any) => ({
      ...f,
      category_name: f.agent_faq_categories?.name ?? "",
      agent_faq_categories: undefined,
    }));

    return apiJson({ categories: catRes.data ?? [], faqs });
  } catch (e) {
    return apiInternalError(e, "agent/faq GET");
  }
}
