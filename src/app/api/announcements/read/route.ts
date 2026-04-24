import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { apiJson, apiUnauthorized, apiValidationError, apiInternalError } from "@/lib/api/response";

// POST: Mark announcement as read
export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: userRes } = await supabase.auth.getUser();
    if (!userRes.user) {
      return apiUnauthorized();
    }

    const { announcement_id } = await req.json();
    if (!announcement_id) {
      return apiValidationError("announcement_id is required");
    }

    const { error } = await supabase
      .from("announcement_reads")
      .upsert({ announcement_id, user_id: userRes.user.id }, { onConflict: "announcement_id,user_id" });

    if (error) throw error;

    return apiJson({ ok: true });
  } catch (e: unknown) {
    return apiInternalError(e, "announcements/read");
  }
}
