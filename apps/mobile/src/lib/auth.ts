import { supabase } from "./supabase";

export type AppRole = "super_admin" | "owner" | "admin" | "staff" | "viewer";

export type PlanTier = "mini" | "standard" | "pro";

export interface UserProfile {
  id: string;
  email: string;
  tenantId: string;
  tenantName: string;
  planTier: PlanTier;
  role: AppRole;
  storeIds: string[];
}

/**
 * 現在のユーザーのプロフィール（テナント情報含む）を取得
 */
export async function fetchUserProfile(): Promise<UserProfile | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  // ponytail: モバイルは1ユーザー=1テナント前提。複数テナントに所属する
  // ユーザー（例: 自店のオーナーが他店に staff 招待された）でも .single() で
  // 落ちないよう、Web 側 (checkRole.ts) と同じく最古の membership を1件選ぶ。
  // 上限: テナントを跨いだ利用は不可。将来必要なら select-store をテナント選択に拡張。
  const { data: membership, error } = await supabase
    .from("tenant_memberships")
    .select(
      `
      tenant_id,
      role,
      tenants (
        name,
        plan_tier
      )
    `
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error || !membership) {
    console.error("fetchUserProfile error:", error?.message);
    return null;
  }

  const tenant = membership.tenants as unknown as { name: string; plan_tier: string } | null;

  return {
    id: user.id,
    email: user.email ?? "",
    tenantId: membership.tenant_id,
    tenantName: tenant?.name ?? "",
    planTier: (tenant?.plan_tier ?? "mini") as PlanTier,
    role: membership.role as AppRole,
    storeIds: [],
  };
}

/**
 * ログイン
 */
export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) throw error;
  return data;
}

/**
 * ログアウト
 */
export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}
