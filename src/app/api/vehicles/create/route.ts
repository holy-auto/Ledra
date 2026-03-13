import { NextResponse } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const supabase = await createSupabaseServerClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: membership } = await supabase
      .from("tenant_memberships")
      .select("tenant_id")
      .eq("user_id", user.id)
      .limit(1)
      .single();

    if (!membership?.tenant_id) {
      return NextResponse.json({ error: "No tenant found" }, { status: 400 });
    }

    const body = await req.json();

    const maker = String(body.maker ?? "").trim();
    const model = String(body.model ?? "").trim();

    if (!maker || !model) {
      return NextResponse.json(
        { error: "メーカーと車種は必須です。" },
        { status: 400 },
      );
    }

    const yearRaw = body.year;
    const year =
      yearRaw !== null && yearRaw !== undefined && yearRaw !== ""
        ? Number(yearRaw)
        : null;

    if (year !== null && (!Number.isFinite(year) || year < 1900 || year > 2100)) {
      return NextResponse.json(
        { error: "年式は1900〜2100の範囲で入力してください。" },
        { status: 400 },
      );
    }

    const insertRow = {
      tenant_id: membership.tenant_id,
      maker,
      model,
      year,
      plate_display: body.plate_display ?? null,
      customer_name: body.customer_name ?? null,
      customer_email: body.customer_email ?? null,
      customer_phone_masked: body.customer_phone_masked ?? null,
      notes: body.notes ?? null,
    };

    const { data: vehicle, error } = await supabase
      .from("vehicles")
      .insert(insertRow)
      .select("id")
      .single();

    if (error) {
      return NextResponse.json(
        { error: error.message ?? "Insert failed" },
        { status: 500 },
      );
    }

    return NextResponse.json({ id: vehicle.id }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Unexpected error" },
      { status: 500 },
    );
  }
}
