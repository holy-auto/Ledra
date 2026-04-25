import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { apiJson, apiUnauthorized, apiValidationError, apiInternalError } from "@/lib/api/response";

const readSchema = z.object({
  announcement_id: z.string().uuid("announcement_id is required"),
});

// POST: Mark announcement as read
export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: userRes } = await supabase.auth.getUser();
    if (!userRes.user) {
      return apiUnauthorized();
    }

    const parsed = readSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }
    const { announcement_id } = parsed.data;

    const { error } = await supabase
      .from("announcement_reads")
      .upsert({ announcement_id, user_id: userRes.user.id }, { onConflict: "announcement_id,user_id" });

    if (error) throw error;

    return apiJson({ ok: true });
  } catch (e: unknown) {
    return apiInternalError(e, "announcements/read");
  }
}
