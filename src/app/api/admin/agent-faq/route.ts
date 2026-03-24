import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/api/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const admin = getAdminClient();
    const [catRes, faqRes] = await Promise.all([
      admin.from("agent_faq_categories").select("*").order("sort_order"),
      admin.from("agent_faqs").select("*, agent_faq_categories(name)").order("sort_order"),
    ]);

    const faqs = (faqRes.data ?? []).map((f: any) => ({
      ...f,
      category_name: f.agent_faq_categories?.name ?? "",
      agent_faq_categories: undefined,
    }));

    return NextResponse.json({ categories: catRes.data ?? [], faqs });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "internal_error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

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

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ faq: data }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "internal_error" }, { status: 500 });
  }
}
