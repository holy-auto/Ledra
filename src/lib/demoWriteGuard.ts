/**
 * 公開デモアカウントからの書き込みを、入口（proxy）でまとめて断る。
 *
 * デモテナントの読み取り専用は RLS（20260514000001）だけで守っていたが、サーバーが
 * サービスロールで書く API（証明書作成など）は RLS を素通りする。書き込みの入口は
 * Web の withCaller・モバイルの resolveMobileCaller・それ以外の route・サーバーアクションと
 * 散らばっているので、全部が必ず通る proxy で「デモテナントの利用者 × 書き込みメソッド」を断る
 * （OPEN_QUESTIONS 2026-10-13「デモテナントの読み取り専用が、サービスロールで書く API には効いていない」）。
 *
 * 利用者の判定は、トークンを検証せずに中の user id を読むだけでよい。デモ利用者の正しいトークンには
 * 必ずデモ利用者の id が入っており、書き換えたトークンは後段の auth.getUser() で弾かれるので、
 * 「デモ利用者なのにここを素通りする」正しいトークンは作れない。
 * ここで Supabase クライアントの getSession() を使わないのは、期限切れのときに refresh token を
 * 消費してしまい（proxy では新しい cookie を返さないので）利用者のセッションが壊れるため。
 *
 * access_token を本文で受け取る Stripe 系の route は proxy から利用者が見えないので、route 側で断る
 * （isDemoTenant）。
 */
import { NextResponse, type NextRequest } from "next/server";
import { combineChunks, stringFromBase64URL } from "@supabase/ssr";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { DEMO_TENANT_ID } from "@/lib/demo";

const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

// セッションの出入り（ログイン・テナント切替・認証コールバック）は書き込みメソッドでも通す。
// ログアウトはブラウザから Supabase へ直接行くので、ここは通らない。
// billing-state は access_token を本文で送るため POST だが、中身は読み取りだけ。
const ALLOWED_PREFIXES = ["/api/auth/", "/auth/", "/login", "/api/csp-report", "/api/admin/billing-state"];

export function isGuardedWrite(method: string, pathname: string): boolean {
  return !READ_METHODS.has(method.toUpperCase()) && !ALLOWED_PREFIXES.some((p) => pathname.startsWith(p));
}

function jwtSub(token: string): string | null {
  const payload = token.split(".")[1];
  if (!payload) return null;
  try {
    const sub = JSON.parse(stringFromBase64URL(payload)).sub;
    return typeof sub === "string" ? sub : null;
  } catch {
    return null;
  }
}

/** Authorization: Bearer（モバイル）と Supabase のセッション cookie（Web）の両方から user id を集める。 */
export async function requestUserIds(request: NextRequest): Promise<string[]> {
  const ids: string[] = [];

  const auth = request.headers.get("authorization") ?? "";
  if (auth.startsWith("Bearer ")) {
    const sub = jwtSub(auth.slice(7).trim());
    if (sub) ids.push(sub);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (url) {
    // @supabase/ssr の既定の保存キー（server.ts の createServerClient は storageKey を変えていない）
    const key = `sb-${new URL(url).hostname.split(".")[0]}-auth-token`;
    const raw = await combineChunks(key, (name) => request.cookies.get(name)?.value);
    if (raw) {
      try {
        const json = raw.startsWith("base64-") ? stringFromBase64URL(raw.slice("base64-".length)) : raw;
        const session = JSON.parse(json);
        const id = session?.user?.id ?? (session?.access_token ? jwtSub(session.access_token) : null);
        if (typeof id === "string") ids.push(id);
      } catch {
        // 読めない cookie は後段の auth.getUser() も読めないので、ここで判定しなくてよい
      }
    }
  }

  return ids;
}

const MEMBER_TTL_MS = 5 * 60_000;
let memberCache: { ids: Set<string>; at: number } | null = null;

// ponytail: デモテナントの所属者を 5 分キャッシュする（今は 1 人）。所属を足しても最大 5 分は
// 古い一覧で判定する。取得に失敗し、キャッシュも無いときは通す（失敗のたびに全テナントの書き込みを
// 止めないため）。その間はデモの書き込みが通りうる。
async function demoMemberIds(): Promise<Set<string> | null> {
  if (memberCache && Date.now() - memberCache.at < MEMBER_TTL_MS) return memberCache.ids;
  const { data, error } = await getSupabaseAdmin()
    .from("tenant_memberships")
    .select("user_id")
    .eq("tenant_id", DEMO_TENANT_ID);
  if (error) {
    console.warn("[demoWriteGuard] demo members lookup failed", error.message);
    return memberCache?.ids ?? null;
  }
  memberCache = { ids: new Set((data ?? []).map((r: { user_id: string }) => r.user_id)), at: Date.now() };
  return memberCache.ids;
}

export function demoReadOnlyResponse(): NextResponse {
  return NextResponse.json(
    { error: "demo_read_only", message: "デモ環境では保存・変更はできません。" },
    { status: 403 },
  );
}

/** 公開デモアカウントの書き込みなら 403 を返す。それ以外は null。 */
export async function demoWriteGuard(request: NextRequest): Promise<NextResponse | null> {
  if (!isGuardedWrite(request.method, request.nextUrl.pathname)) return null;
  const userIds = await requestUserIds(request);
  if (userIds.length === 0) return null;
  const demoIds = await demoMemberIds();
  if (!demoIds || !userIds.some((id) => demoIds.has(id))) return null;
  return demoReadOnlyResponse();
}
