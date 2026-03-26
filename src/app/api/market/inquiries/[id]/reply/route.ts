import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyInquiryReply } from "@/lib/market/email";
import { checkRateLimit } from "@/lib/api/rateLimit";

export const dynamic = "force-dynamic";

// ─── POST: Add a message to the inquiry thread ───
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const limited = await checkRateLimit(req, "general");
  if (limited) return limited;

  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
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
      console.error("[inquiry-reply] insert_failed:", insertErr.message);
      return NextResponse.json({ error: "insert_failed" }, { status: 500 });
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
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

// ─── GET: Get all messages for an inquiry ───
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const limited = await checkRateLimit(_req, "general");
  if (limited) return limited;

  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
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
      console.error("[inquiry-reply] db_error:", error.message);
      return NextResponse.json({ error: "db_error" }, { status: 500 });
    }

    return NextResponse.json({ messages: messages ?? [] });
  } catch (e: any) {
    console.error("inquiry messages list failed", e);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
