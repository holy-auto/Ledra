import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { isPlatformAdmin } from "@/lib/auth/platformAdmin";
import { getClientIp } from "@/lib/rateLimit";

export const runtime = "nodejs";

async function requirePlatformAdmin(supabase: Awaited<ReturnType<typeof createClient>>) {
  const caller = await resolveCallerWithRole(supabase);
  if (!caller || !isPlatformAdmin(caller)) return null;
  return caller;
}

async function logAdminAction(params: {
  actorId: string;
  action: string;
  targetType: string;
  targetId: string;
  beforeData?: Record<string, unknown>;
  afterData?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
}) {
  const admin = createAdminClient();
  await admin.from("admin_audit_logs").insert({
    actor_id: params.actorId,
    action: params.action,
    target_type: params.targetType,
    target_id: params.targetId,
    before_data: params.beforeData ?? null,
    after_data: params.afterData ?? null,
    ip: params.ip ?? null,
    user_agent: params.userAgent ?? null,
  }).then(({ error }) => {
    if (error) console.error("[admin-audit] insert failed:", error.message);
  });
}

/**
 * GET /api/admin/insurers/tenant-access?insurer_id=xxx
 * List tenant access grants for an insurer (or all if no insurer_id).
 */
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const caller = await requirePlatformAdmin(supabase);
  if (!caller) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const insurerId = url.searchParams.get("insurer_id");

  const admin = createAdminClient();

  let query = admin
    .from("insurer_tenant_access")
    .select("id, insurer_id, tenant_id, granted_by, granted_at, revoked_at, is_active, notes, created_at")
    .order("created_at", { ascending: false });

  if (insurerId) {
    query = query.eq("insurer_id", insurerId);
  }

  const { data, error } = await query;
  if (error) {
    console.error("[tenant-access] list error:", error.message);
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }

  // Enrich with insurer and tenant names
  const insurerIds = [...new Set((data ?? []).map((r) => r.insurer_id))];
  const tenantIds = [...new Set((data ?? []).map((r) => r.tenant_id))];

  const [insurerRes, tenantRes] = await Promise.all([
    insurerIds.length > 0
      ? admin.from("insurers").select("id, name").in("id", insurerIds)
      : { data: [] },
    tenantIds.length > 0
      ? admin.from("tenants").select("id, name").in("id", tenantIds)
      : { data: [] },
  ]);

  const insurerMap = new Map((insurerRes.data ?? []).map((i: any) => [i.id, i.name]));
  const tenantMap = new Map((tenantRes.data ?? []).map((t: any) => [t.id, t.name]));

  const enriched = (data ?? []).map((row) => ({
    ...row,
    insurer_name: insurerMap.get(row.insurer_id) ?? null,
    tenant_name: tenantMap.get(row.tenant_id) ?? null,
  }));

  return NextResponse.json({ grants: enriched });
}

/**
 * POST /api/admin/insurers/tenant-access
 * Grant a tenant access to an insurer.
 * Body: { insurer_id, tenant_id, notes? }
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const caller = await requirePlatformAdmin(supabase);
  if (!caller) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const { insurer_id, tenant_id, notes } = body;
  if (!insurer_id || !tenant_id) {
    return NextResponse.json({ error: "insurer_id and tenant_id are required" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Check if grant already exists (including revoked ones — reactivate)
  const { data: existing } = await admin
    .from("insurer_tenant_access")
    .select("id, is_active, revoked_at")
    .eq("insurer_id", insurer_id)
    .eq("tenant_id", tenant_id)
    .maybeSingle();

  const ip = getClientIp(req);
  const userAgent = req.headers.get("user-agent") ?? "";

  if (existing) {
    if (existing.is_active && !existing.revoked_at) {
      return NextResponse.json({ error: "grant_already_exists", message: "このアクセス許可は既に有効です。" }, { status: 409 });
    }

    // Reactivate revoked grant
    const { data: updated, error } = await admin
      .from("insurer_tenant_access")
      .update({
        is_active: true,
        revoked_at: null,
        granted_by: caller.userId,
        granted_at: new Date().toISOString(),
        notes: notes || existing.id,
      })
      .eq("id", existing.id)
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: "db_error", message: error.message }, { status: 500 });
    }

    logAdminAction({
      actorId: caller.userId,
      action: "tenant_access_reactivate",
      targetType: "insurer_tenant_access",
      targetId: existing.id,
      afterData: { insurer_id, tenant_id },
      ip,
      userAgent,
    });

    return NextResponse.json({ ok: true, grant: updated }, { status: 200 });
  }

  // Create new grant
  const { data: newGrant, error } = await admin
    .from("insurer_tenant_access")
    .insert({
      insurer_id,
      tenant_id,
      granted_by: caller.userId,
      granted_at: new Date().toISOString(),
      is_active: true,
      notes: notes || null,
    })
    .select("*")
    .single();

  if (error) {
    console.error("[tenant-access] create error:", error.message);
    return NextResponse.json({ error: "db_error", message: error.message }, { status: 500 });
  }

  logAdminAction({
    actorId: caller.userId,
    action: "tenant_access_grant",
    targetType: "insurer_tenant_access",
    targetId: newGrant.id,
    afterData: { insurer_id, tenant_id, notes },
    ip,
    userAgent,
  });

  return NextResponse.json({ ok: true, grant: newGrant }, { status: 201 });
}

/**
 * PATCH /api/admin/insurers/tenant-access
 * Revoke or update a tenant access grant.
 * Body: { id, action: "revoke" | "update", notes? }
 */
export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  const caller = await requirePlatformAdmin(supabase);
  if (!caller) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const { id, action, notes } = body;
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const admin = createAdminClient();
  const ip = getClientIp(req);
  const userAgent = req.headers.get("user-agent") ?? "";

  // Fetch current state
  const { data: before } = await admin
    .from("insurer_tenant_access")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!before) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  if (action === "revoke") {
    const { data: updated, error } = await admin
      .from("insurer_tenant_access")
      .update({
        is_active: false,
        revoked_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: "db_error", message: error.message }, { status: 500 });
    }

    logAdminAction({
      actorId: caller.userId,
      action: "tenant_access_revoke",
      targetType: "insurer_tenant_access",
      targetId: id,
      beforeData: { is_active: before.is_active },
      afterData: { is_active: false, revoked_at: updated.revoked_at },
      ip,
      userAgent,
    });

    return NextResponse.json({ ok: true, grant: updated });
  }

  // Default: update notes
  const updates: Record<string, unknown> = {};
  if (notes !== undefined) updates.notes = notes;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "no_updates" }, { status: 400 });
  }

  const { data: updated, error } = await admin
    .from("insurer_tenant_access")
    .update(updates)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: "db_error", message: error.message }, { status: 500 });
  }

  logAdminAction({
    actorId: caller.userId,
    action: "tenant_access_update",
    targetType: "insurer_tenant_access",
    targetId: id,
    beforeData: { notes: before.notes },
    afterData: { notes: updated.notes },
    ip,
    userAgent,
  });

  return NextResponse.json({ ok: true, grant: updated });
}
