import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/api/auth";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import { apiUnauthorized, apiForbidden, apiInternalError } from "@/lib/api/response";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = await createClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "admin")) return apiForbidden();

    const admin = getAdminClient();
    const [catRes, faqRes] = await Promise.all([
      admin.from("agent_faq_categories").select("id, name, slug, sort_order, description").order("sort_order"),
      admin.from("agent_faqs").select("*, agent_faq_categories(name)").order("sort_order"),
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
    return apiInternalError(e, "agent-faq GET");
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "admin")) return apiForbidden();

    const body = await request.json();
    const admin = getAdminClient();

    const { data, error } = await admin
      .from("agent_faqs")
      .insert({
        category_id: body.category_id,
        question: body.question,
        answer: body.answer,
        sort_order: body.sort_order ?? 0,
        is_published: body.is_published ?? true,
      })
      .select()
      .single();

    if (error) return apiInternalError(error, "agent-faq POST");
    return NextResponse.json({ faq: data }, { status: 201 });
  } catch (e) {
    return apiInternalError(e, "agent-faq POST");
  }
}
