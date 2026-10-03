import type { SupabaseClient } from "@supabase/supabase-js";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";

import { apiJson, apiValidationError, apiInternalError } from "@/lib/api/response";
import {
  staffCreateSchema,
  staffUpdateSchema,
  staffDeleteSchema,
  type QualificationDetailInput,
} from "@/lib/validations/staff";
import { STAFF_QUALIFICATIONS } from "@/lib/staff/qualifications";

import { withCaller } from "@/lib/api/withCaller";

/**
 * スタッフの法定資格の番号・有効期限（staff_qualifications）をスタッフ単位で同期する。
 * 保有の有無は staff_members.qualifications（text[]）が源泉。ここは属性行を provided に合わせる。
 *
 * **データ損失を作らない順序**: 先に upsert（挿入/更新）→ 後に「送られなかったキー」を削除。
 * delete→insert の順にすると insert が一時失敗したときに既存の番号・有効期限が消える（CLAUDE.md
 * 「データ損失を防ぐエラー処理」は非譲歩）。upsert が失敗しても既存行は残り、prune が失敗しても
 * 残るのは未選択キーの古い明細だけ（ゲートは held を見るため無害）で、いずれも損失は起きない。
 * details===undefined（未送信）のときは何もしない。
 */
async function replaceStaffQualificationDetails(
  db: Pick<SupabaseClient, "from">,
  tenantId: string,
  staffId: string,
  details: QualificationDetailInput[] | undefined,
): Promise<{ error: unknown } | null> {
  if (details === undefined) return null;
  // 同一キーの重複送信は最後の値を採用（unique(tenant,staff,qualification) 違反を避ける）。
  const byKey = new Map<string, QualificationDetailInput>();
  for (const d of details) byKey.set(d.qualification, d);

  if (byKey.size > 0) {
    const rows = [...byKey.values()].map((d) => ({
      tenant_id: tenantId,
      staff_member_id: staffId,
      qualification: d.qualification,
      number: d.number,
      expires_on: d.expires_on,
    }));
    const up = await db
      .from("staff_qualifications")
      .upsert(rows, { onConflict: "tenant_id,staff_member_id,qualification" });
    if (up.error) return { error: up.error };
  }

  // 今回送られなかった統制語彙キーの明細だけを削除する（保存時は常にカタログキーなので取りこぼし無し）。
  const toRemove = STAFF_QUALIFICATIONS.map((q) => q.key).filter((k) => !byKey.has(k));
  if (toRemove.length > 0) {
    const del = await db
      .from("staff_qualifications")
      .delete()
      .eq("tenant_id", tenantId)
      .eq("staff_member_id", staffId)
      .in("qualification", toRemove);
    if (del.error) return { error: del.error };
  }
  return null;
}
/** 紐付け先 user_id が当該テナントのメンバーか確認（他テナントアカウント連携の防止）。 */
async function userInTenant(tenantId: string, userId: string): Promise<boolean> {
  const { admin } = createTenantScopedAdmin(tenantId);
  const { data } = await admin
    .from("tenant_memberships")
    .select("user_id")
    .eq("tenant_id", tenantId)
    .eq("user_id", userId)
    .maybeSingle();
  return !!data;
}

export const dynamic = "force-dynamic";

function windowToSince(window: string | null): string | null {
  const now = Date.now();
  switch (window) {
    case "30d":
      return new Date(now - 30 * 86_400_000).toISOString();
    case "90d":
      return new Date(now - 90 * 86_400_000).toISOString();
    case "365d":
      return new Date(now - 365 * 86_400_000).toISOString();
    default:
      return null; // all-time
  }
}

type RosterStat = {
  staff_id: string;
  assignments_total: number;
  completed: number;
  cancelled: number;
  avg_work_minutes: number | null;
};

// GET: スタッフ一覧 + 担当者別実績（roster stats）をマージして返す
export const GET = withCaller(
  async (req, { caller, supabase }) => {
    try {
      // 連絡先・メモ・実績を含む管理ロスターは members:view に限定。
      // 案件アサイン用の最小一覧は /api/admin/staff/picker（reservations:view）を使う。

      const window = new URL(req.url).searchParams.get("window");
      const since = windowToSince(window);

      const [staffRes, statsRes] = await Promise.all([
        supabase
          .from("staff_members")
          .select(
            "id, user_id, name, kind, email, phone, skills, qualifications, color, is_active, note, commission_rate, created_at, qualification_details:staff_qualifications ( qualification, number, expires_on )",
          )
          .eq("tenant_id", caller.tenantId)
          .order("is_active", { ascending: false })
          .order("name", { ascending: true }),
        supabase.rpc("staff_roster_stats", { p_tenant_id: caller.tenantId, p_since: since }),
      ]);

      if (staffRes.error) return apiInternalError(staffRes.error, "staff list");

      const statsMap = new Map<string, RosterStat>();
      for (const s of (statsRes.data ?? []) as RosterStat[]) statsMap.set(s.staff_id, s);

      const staff = (staffRes.data ?? []).map((s) => {
        const st = statsMap.get(s.id);
        return {
          ...s,
          skills: s.skills ?? [],
          qualifications: s.qualifications ?? [],
          qualification_details: s.qualification_details ?? [],
          stats: {
            assignments_total: st?.assignments_total ?? 0,
            completed: st?.completed ?? 0,
            cancelled: st?.cancelled ?? 0,
            avg_work_minutes: st?.avg_work_minutes ?? null,
          },
        };
      });

      return apiJson({ staff });
    } catch (e) {
      return apiInternalError(e, "staff list");
    }
  },
  { permission: "members:view", routeName: "staff list" },
);

// POST: スタッフ作成
export const POST = withCaller(
  async (req, { caller, supabase }) => {
    try {
      const parsed = staffCreateSchema.safeParse(await req.json().catch(() => ({})));
      if (!parsed.success) {
        return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
      }
      const input = parsed.data;
      // user_id を紐付けるなら社内扱い。外注は user_id を持たない。
      const kind = input.user_id ? "internal" : input.kind;
      const userId = kind === "external" ? null : input.user_id;
      if (userId && !(await userInTenant(caller.tenantId, userId))) {
        return apiValidationError("linked_user_not_in_tenant");
      }

      const { data, error } = await supabase
        .from("staff_members")
        .insert({
          id: crypto.randomUUID(),
          tenant_id: caller.tenantId,
          user_id: userId,
          name: input.name,
          kind,
          email: input.email,
          phone: input.phone,
          skills: input.skills,
          qualifications: input.qualifications,
          color: input.color,
          note: input.note,
          is_active: input.is_active,
          commission_rate: input.commission_rate,
        })
        .select("id")
        .single();
      if (error) return apiInternalError(error, "staff create");

      const detErr = await replaceStaffQualificationDetails(
        supabase,
        caller.tenantId,
        data.id,
        input.qualification_details,
      );
      if (detErr) return apiInternalError(detErr.error, "staff create qualification details");

      return apiJson({ ok: true, id: data.id });
    } catch (e) {
      return apiInternalError(e, "staff create");
    }
  },
  { permission: "members:manage", routeName: "staff create" },
);

// PUT: スタッフ更新
export const PUT = withCaller(
  async (req, { caller, supabase }) => {
    try {
      const rawBody = await req.json().catch(() => ({}));
      const parsed = staffUpdateSchema.safeParse(rawBody);
      if (!parsed.success) {
        return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
      }
      const { id, ...rest } = parsed.data;

      // 送られたキーだけ更新（部分更新で未指定を上書きしない）
      const sentKeys = new Set(
        rawBody && typeof rawBody === "object" ? Object.keys(rawBody as Record<string, unknown>) : [],
      );
      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      for (const [key, value] of Object.entries(rest)) {
        if (value !== undefined && sentKeys.has(key)) updates[key] = value;
      }
      // qualification_details は staff_members のカラムではなく別表（staff_qualifications）。
      // staff_members の更新ペイロードから除き、下で一括置換する。
      delete updates.qualification_details;
      // user_id ↔ kind の整合をとる
      if ("user_id" in updates && updates.user_id) updates.kind = "internal";
      if (updates.kind === "external") updates.user_id = null;
      if (
        typeof updates.user_id === "string" &&
        updates.user_id &&
        !(await userInTenant(caller.tenantId, updates.user_id))
      ) {
        return apiValidationError("linked_user_not_in_tenant");
      }

      const { error } = await supabase
        .from("staff_members")
        .update(updates)
        .eq("id", id)
        .eq("tenant_id", caller.tenantId);
      if (error) return apiInternalError(error, "staff update");

      // 資格明細（番号・有効期限）を送信時のみ一括置換。
      const detErr = sentKeys.has("qualification_details")
        ? await replaceStaffQualificationDetails(supabase, caller.tenantId, id, rest.qualification_details ?? [])
        : null;
      if (detErr) return apiInternalError(detErr.error, "staff update qualification details");

      return apiJson({ ok: true });
    } catch (e) {
      return apiInternalError(e, "staff update");
    }
  },
  { permission: "members:manage", routeName: "staff update" },
);

// DELETE: スタッフ削除（reservations.assigned_staff_id は SET NULL、shifts は CASCADE）
export const DELETE = withCaller(
  async (req, { caller, supabase }) => {
    try {
      const parsed = staffDeleteSchema.safeParse(await req.json().catch(() => ({})));
      if (!parsed.success) {
        return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
      }

      const { error } = await supabase
        .from("staff_members")
        .delete()
        .eq("id", parsed.data.id)
        .eq("tenant_id", caller.tenantId);
      if (error) return apiInternalError(error, "staff delete");

      return apiJson({ ok: true });
    } catch (e) {
      return apiInternalError(e, "staff delete");
    }
  },
  { permission: "members:manage", routeName: "staff delete" },
);
