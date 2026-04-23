import { NextRequest } from "next/server";
import { resolveMobileCaller } from "@/lib/auth/mobileAuth";
import { apiOk, apiUnauthorized, apiValidationError, apiInternalError } from "@/lib/api/response";

export const dynamic = "force-dynamic";

// ─── POST: Register push notification token ───
export async function POST(request: NextRequest) {
  try {
    const caller = await resolveMobileCaller(request);
    if (!caller) return apiUnauthorized();

    const body = await request.json().catch((): null => null);
    if (!body?.token || typeof body.token !== "string") {
      return apiValidationError("token is required");
    }
    if (!body.platform || !["ios", "android"].includes(body.platform)) {
      return apiValidationError('platform must be "ios" or "android"');
    }

    const { data, error } = await caller.supabase
      .from("push_tokens")
      .upsert(
        {
          user_id: caller.userId,
          tenant_id: caller.tenantId,
          token: body.token,
          platform: body.platform,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,token" },
      )
      .select("id, user_id, tenant_id, token, platform, updated_at")
      .single();

    if (error) return apiInternalError(error, "push.register");

    return apiOk({ push_token: data });
  } catch (e) {
    return apiInternalError(e, "push.register");
  }
}

// ─── DELETE: Remove push token ───
export async function DELETE(request: NextRequest) {
  try {
    const caller = await resolveMobileCaller(request);
    if (!caller) return apiUnauthorized();

    const body = await request.json().catch((): null => null);
    if (!body?.token || typeof body.token !== "string") {
      return apiValidationError("token is required");
    }

    const { error } = await caller.supabase
      .from("push_tokens")
      .delete()
      .eq("user_id", caller.userId)
      .eq("token", body.token);

    if (error) return apiInternalError(error, "push.unregister");

    return apiOk({ deleted: true });
  } catch (e) {
    return apiInternalError(e, "push.unregister");
  }
}
