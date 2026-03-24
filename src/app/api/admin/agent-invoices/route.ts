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
    const { data } = await admin
      .from("agent_invoices")
      .select("*, agents(name)")
      .order("created_at", { ascending: false });

    const invoices = (data ?? []).map((inv: any) => ({
      ...inv,
      agent_name: inv.agents?.name ?? "",
      agents: undefined,
    }));

    return NextResponse.json({ invoices });
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

    const subtotal = body.subtotal ?? 0;
    const taxRate = body.tax_rate ?? 10;
    const taxAmount = Math.round(subtotal * taxRate / 100);
    const total = subtotal + taxAmount;

    const { data: invoice, error: invErr } = await admin
      .from("agent_invoices")
      .insert({
        agent_id: body.agent_id,
        period_start: body.period_start,
        period_end: body.period_end,
        subtotal,
        tax_rate: taxRate,
        tax_amount: taxAmount,
        total,
        status: body.status ?? "draft",
        notes: body.notes || null,
      })
      .select()
      .single();

    if (invErr) return NextResponse.json({ error: invErr.message }, { status: 500 });

    // Insert line items if provided
    if (body.lines && Array.isArray(body.lines) && body.lines.length > 0) {
      const lines = body.lines.map((line: any) => ({
        invoice_id: invoice.id,
        description: line.description,
        quantity: line.quantity ?? 1,
        unit_price: line.unit_price ?? 0,
        amount: line.amount ?? (line.quantity ?? 1) * (line.unit_price ?? 0),
        referral_id: line.referral_id || null,
      }));
      await admin.from("agent_invoice_lines").insert(lines);
    }

    return NextResponse.json({ invoice }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "internal_error" }, { status: 500 });
  }
}
