import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseService } from "@/lib/supabase";

const Body = z.object({
  public_id: z.string().min(10),
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { error } = await supabaseService
    .from("certificates")
    .update({ status: "void" })
    .eq("public_id", parsed.data.public_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
