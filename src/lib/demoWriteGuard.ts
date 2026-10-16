/**
 * 公開デモアカウントからの書き込みを、入口（proxy）でまとめて断る。
 * ブラウザから DB・Storage を直接書く経路は RLS で断る（20261016135012）。
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
import type { NextRequest, NextResponse } from "next/server";
import { combineChunks, stringFromBase64URL } from "@supabase/ssr";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { apiError } from "@/lib/api/response";
import { DEMO_TENANT_ID } from "@/lib/demo";

const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * テナントの利用者として認証して書き込む route があるパス（と、サーバーアクションを持つ /admin）。
 * 公開ページの問い合わせ・資料請求・新規登録（/api/contact・/api/marketing・/api/signup 等）は含めない ——
 * デモを試した人が同じブラウザで送ると、ここで断ってしまうため。
 * 新しい場所にテナントの書き込み route を足したら、ここにも足す（demoWriteGuard.test.ts が検出する）。
 */
export const GUARDED_PREFIXES = [
  "/admin",
  "/api/admin/",
  "/api/announcements/",
  "/api/certificates/",
  "/api/consent/",
  "/api/identity/",
  "/api/market/",
  "/api/mobile/",
  "/api/parts/",
  "/api/passport/",
  "/api/signature/",
  "/api/stripe/",
  "/api/template-options",
  "/api/vehicles",
  "/api/webauthn/",
];

// billing-state は access_token を本文で送るため POST だが、中身は読み取りだけ。
const ALLOWED_PREFIXES = ["/api/admin/billing-state"];

export function isGuardedWrite(method: string, pathname: string): boolean {
  return (
    !READ_METHODS.has(method.toUpperCase()) &&
    GUARDED_PREFIXES.some((p) => pathname.startsWith(p)) &&
    !ALLOWED_PREFIXES.some((p) => pathname.startsWith(p))
  );
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
        // 署名された access_token の sub だけを見る。同じ cookie の user.id は誰でも書き換えられる
        // （後段の auth.getUser() は access_token しか見ないので、書き換えても通ってしまう）。
        const accessToken = JSON.parse(json)?.access_token;
        const id = typeof accessToken === "string" ? jwtSub(accessToken) : null;
        if (id) ids.push(id);
      } catch {
        // 読めない cookie は後段の auth.getUser() も読めないので、ここで判定しなくてよい
      }
    }
  }

  return ids;
}

const MEMBER_TTL_MS = 5 * 60_000;
const FAILURE_TTL_MS = 30_000;
let memberCache: { ids: Set<string> | null; at: number; ttl: number } | null = null;
let inFlight: Promise<Set<string> | null> | null = null;

// ponytail: デモテナントの所属者を 5 分キャッシュする（今は公開アカウントの 1 人だけ）。所属を足しても最大 5 分は
// 古い一覧で判定する。判定は「デモテナントに所属しているか」で、選択中のテナントは見ない —— デモテナントに
// 運営者を所属させると、その人は全テナントで書き込めなくなる（デモテナントには公開アカウントだけを置く）。
// 取得に失敗したら（鍵が無い環境も含む）30 秒は「不明」として通す（失敗のたびに全テナントの書き込みを
// 止めたり、毎回問い合わせて遅くしたりしないため）。その間はデモの書き込みが通りうる。
async function demoMemberIds(): Promise<Set<string> | null> {
  if (memberCache && Date.now() - memberCache.at < memberCache.ttl) return memberCache.ids;
  inFlight ??= (async () => {
    try {
      const { data, error } = await getSupabaseAdmin()
        .from("tenant_memberships")
        .select("user_id")
        .eq("tenant_id", DEMO_TENANT_ID);
      if (error) throw error;
      const ids = new Set((data ?? []).map((r: { user_id: string }) => r.user_id));
      memberCache = { ids, at: Date.now(), ttl: MEMBER_TTL_MS };
      return ids;
    } catch (e) {
      console.warn("[demoWriteGuard] demo members lookup failed", e instanceof Error ? e.message : e);
      const ids = memberCache?.ids ?? null;
      memberCache = { ids, at: Date.now(), ttl: FAILURE_TTL_MS };
      return ids;
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

export function demoReadOnlyResponse(): NextResponse {
  return apiError({
    code: "forbidden",
    status: 403,
    message: "デモ環境では保存・変更はできません。",
    data: { reason: "demo_read_only" },
  });
}

/** テスト用: キャッシュを捨てる */
export function resetDemoMemberCacheForTest(): void {
  memberCache = null;
  inFlight = null;
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
