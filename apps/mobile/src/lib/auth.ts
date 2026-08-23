import { supabase } from "./supabase";
import { pickDefaultStore, type StoreOption } from "./storeSelection";

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

/** 店舗一覧の1件。select-store の表示に address が要るので StoreOption を広げている。 */
export interface ActiveStore extends StoreOption {
  address: string | null;
}

/**
 * テナント配下の有効な店舗を取得する。
 *
 * 起動処理 (useAuthInit) と店舗選択画面 (select-store) の両方が使う。
 * 絞り込み条件（is_active・テナント境界・並び順）が2箇所に散ると
 * 片方だけ直して食い違うので、ここ1箇所に集約している。
 */
export async function fetchActiveStores(
  tenantId: string,
): Promise<ActiveStore[]> {
  const { data, error } = await supabase
    .from("stores")
    .select("id, name, address, is_default")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .order("is_default", { ascending: false })
    .order("sort_order");

  if (error) throw error;
  return data ?? [];
}

/**
 * テナントの店舗が1つだけなら、その店舗を確定して返す。それ以外は null。
 *
 * 起動処理 (useAuthInit) とログイン (login.tsx) の両方が、画面を出す前に呼ぶ。
 * これをやらないと /(tabs) → /(auth)/select-store → 店舗フェッチ → /(tabs) と
 * 画面が2回変わる。ちらつきの実体は select-store のフェッチ時間なので、
 * 遷移先を決める前に済ませてしまえばホップ自体が消える。
 *
 * 失敗しても呼び出し側を止めない。null が返れば select-store に流れるだけで、
 * 挙動はこの仕組みが無かったときと同じになる。
 */
export async function resolveDefaultStore(
  tenantId: string,
): Promise<{ id: string; name: string } | null> {
  try {
    return pickDefaultStore(await fetchActiveStores(tenantId));
  } catch (e) {
    // 呼び出し側を止めないための握りつぶしだが、無言だと原因が追えないので残す
    console.warn(
      "resolveDefaultStore failed:",
      e instanceof Error ? e.message : e,
    );
    return null;
  }
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
