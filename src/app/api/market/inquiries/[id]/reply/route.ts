import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyInquiryReply } from "@/lib/market/email";

export const dynamic = "force-dynamic";

async function resolveCallerTenant(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>) {
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes?.user) return null;

  const { data: mem } = await supabase
    .from("tenant_memberships")
    .select("tenant_id")
    .eq("user_id", userRes.user.id)
    .limit(1)
    .single();

  if (!mem?.tenant_id) return null;

  return {
    userId: userRes.user.id,
    tenantId: mem.tenant_id as string,
  };
}

// ─── POST: Add a message to the inquiry thread ───
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerTenant(supabase);
    if (!caller) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const { id: inquiryId } = await params;
    const admin = createAdminClient();
    const body = await req.json().catch(() => ({} as any));

    const message = (body?.message ?? "").trim();
    const senderType = (body?.sender_type ?? "").trim();

    if (!message || !senderType) {
      return NextResponse.json(
        { error: "message and sender_type are required" },
        { status: 400 },
      );
    }

    // Verify the caller owns this inquiry
    const { data: inquiry, error: iqErr } = await admin
      .from("market_inquiries")
      .select("id, status, seller_tenant_id")
      .eq("id", inquiryId)
      .eq("seller_tenant_id", caller.tenantId)
      .single();

    if (iqErr || !inquiry) {
      return NextResponse.json({ error: "inquiry_not_found" }, { status: 404 });
    }

    // Insert the reply message
    const replyRow = {
      id: crypto.randomUUID(),
      inquiry_id: inquiryId,
      sender_type: senderType,
      message,
    };

    const { data: reply, error: insertErr } = await admin
      .from("market_inquiry_messages")
      .insert(replyRow)
      .select()
      .single();

    if (insertErr) {
      return NextResponse.json({ error: "insert_failed", detail: insertErr.message }, { status: 500 });
    }

    // Update inquiry status to "responded" if currently "new"
    if (inquiry.status === "new") {
      await admin
        .from("market_inquiries")
        .update({ status: "responded", updated_at: new Date().toISOString() })
        .eq("id", inquiryId);
    }

    // Notify buyer via email when seller replies (non-blocking)
    if (senderType === "seller") {
      try {
        const { data: fullInquiry } = await admin
          .from("market_inquiries")
          .select("buyer_email, buyer_name, vehicle_id, market_vehicles(maker, model, tenants(name))")
          .eq("id", inquiryId)
          .single();
        const buyerEmail = (fullInquiry as any)?.buyer_email;
        const vehicle = (fullInquiry as any)?.market_vehicles;
        const sellerName = vehicle?.tenants?.name ?? "出品者";
        const vehicleLabel = [vehicle?.maker, vehicle?.model].filter(Boolean).join(" ") || "車両";
        if (buyerEmail) {
          notifyInquiryReply(buyerEmail, { sellerName, vehicleLabel, message }).catch((e) =>
            console.warn("[market] notifyInquiryReply failed:", e)
          );
        }
      } catch (e) {
        console.warn("[market] buyer notification failed:", e);
      }
    }

    return NextResponse.json({ ok: true, reply });
  } catch (e: any) {
    console.error("inquiry reply failed", e);
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 });
  }
}

// ─── GET: Get all messages for an inquiry ───
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerTenant(supabase);
    if (!caller) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const { id: inquiryId } = await params;
    const admin = createAdminClient();

    // Verify the caller owns this inquiry
    const { data: inquiry, error: iqErr } = await admin
      .from("market_inquiries")
      .select("id, seller_tenant_id")
      .eq("id", inquiryId)
      .eq("seller_tenant_id", caller.tenantId)
      .single();

    if (iqErr || !inquiry) {
      return NextResponse.json({ error: "inquiry_not_found" }, { status: 404 });
    }

    const { data: messages, error } = await admin
      .from("market_inquiry_messages")
      .select("*")
      .eq("inquiry_id", inquiryId)
      .order("created_at", { ascending: true });

    if (error) {
      return NextResponse.json({ error: "db_error", detail: error.message }, { status: 500 });
    }

    return NextResponse.json({ messages: messages ?? [] });
  } catch (e: any) {
    console.error("inquiry messages list failed", e);
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 });
  }
}
