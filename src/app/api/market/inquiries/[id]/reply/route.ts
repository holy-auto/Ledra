import { NextRequest } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { notifyInquiryReply } from "@/lib/market/email";
import { apiJson, apiUnauthorized, apiValidationError, apiNotFound, apiInternalError } from "@/lib/api/response";
import { inquiryReplySchema } from "@/lib/validations/market";

export const dynamic = "force-dynamic";

// ─── POST: Add a message to the inquiry thread ───
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const { id: inquiryId } = await params;
    const { admin } = createTenantScopedAdmin(caller.tenantId);
    const parsed = inquiryReplySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }
    const { message, sender_type: senderType } = parsed.data;

    // Verify the caller owns this inquiry
    const { data: inquiry, error: iqErr } = await admin
      .from("market_inquiries")
      .select("id, status, seller_tenant_id")
      .eq("id", inquiryId)
      .eq("seller_tenant_id", caller.tenantId)
      .single();

    if (iqErr || !inquiry) {
      return apiNotFound("inquiry_not_found");
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
      .select("id, inquiry_id, sender_type, message, created_at")
      .single();

    if (insertErr) {
      return apiInternalError(insertErr, "inquiry-reply insert");
    }

    // Update inquiry status to "responded" if currently "new". Scope the
    // UPDATE by seller_tenant_id to prevent any TOCTOU / future refactor
    // from writing into another tenant's row.
    if (inquiry.status === "new") {
      await admin
        .from("market_inquiries")
        .update({ status: "responded", updated_at: new Date().toISOString() })
        .eq("id", inquiryId)
        .eq("seller_tenant_id", caller.tenantId);
    }

    // Notify buyer via email when seller replies (non-blocking)
    if (senderType === "seller") {
      type InquiryWithRelations = {
        buyer_email: string | null;
        buyer_name: string | null;
        vehicle_id: string | null;
        market_vehicles: {
          maker: string | null;
          model: string | null;
          tenants: { name: string | null } | null;
        } | null;
      };
      try {
        const { data: fullInquiry } = await admin
          .from("market_inquiries")
          .select("buyer_email, buyer_name, vehicle_id, market_vehicles(maker, model, tenants(name))")
          .eq("id", inquiryId)
          .single<InquiryWithRelations>();
        const buyerEmail = fullInquiry?.buyer_email;
        const vehicle = fullInquiry?.market_vehicles;
        const sellerName = vehicle?.tenants?.name ?? "出品者";
        const vehicleLabel = [vehicle?.maker, vehicle?.model].filter(Boolean).join(" ") || "車両";
        if (buyerEmail) {
          notifyInquiryReply(buyerEmail, { sellerName, vehicleLabel, message }).catch((e) =>
            console.warn("[market] notifyInquiryReply failed:", e),
          );
        }
      } catch (e) {
        console.warn("[market] buyer notification failed:", e);
      }
    }

    return apiJson({ ok: true, reply });
  } catch (e: unknown) {
    return apiInternalError(e, "inquiry-reply");
  }
}

// ─── GET: Get all messages for an inquiry ───
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const { id: inquiryId } = await params;
    const { admin } = createTenantScopedAdmin(caller.tenantId);

    // Verify the caller owns this inquiry
    const { data: inquiry, error: iqErr } = await admin
      .from("market_inquiries")
      .select("id, seller_tenant_id")
      .eq("id", inquiryId)
      .eq("seller_tenant_id", caller.tenantId)
      .single();

    if (iqErr || !inquiry) {
      return apiNotFound("inquiry_not_found");
    }

    const { data: messages, error } = await admin
      .from("market_inquiry_messages")
      .select("id, inquiry_id, sender_type, message, created_at")
      .eq("inquiry_id", inquiryId)
      .order("created_at", { ascending: true });

    if (error) {
      return apiInternalError(error, "inquiry-reply list");
    }

    return apiJson({ messages: messages ?? [] });
  } catch (e: unknown) {
    return apiInternalError(e, "inquiry-reply list");
  }
}
