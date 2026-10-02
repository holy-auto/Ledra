import { Agent } from "undici";

/**
 * TLS 1.3 未満を拒否する fetch。Backend → Supabase（Postgres REST / Storage / Auth）の
 * サブシステム間通信に使う（C2PA GPSA O.5 / Req 5.1: TLS v1.3 以上で保護）。
 * 相手が 1.2 までしか話さなければハンドシェイクで失敗し、旧版へは落ちない。
 *
 * fetch 本体は差し替えず、グローバル fetch（Next がパッチした版）に **dispatcher だけ**を渡す。
 * undici パッケージの fetch を使うと、Node 組み込みの FormData / Request を解釈できず
 * multipart が "[object FormData]" に化ける（Storage の Blob/File アップロードが壊れる）。
 * Next の patch-fetch は init を展開して元の fetch に渡すので dispatcher は届き、
 * Next の計測・メモ化もそのまま効く。
 * ponytail: Node ランタイム専用（Edge では undici を読めない）。proxy.ts は Next 16 で常に Node。
 */
const agent = new Agent({ connect: { minVersion: "TLSv1.3" } });

export const tls13Fetch: typeof fetch = (input, init) => fetch(input, { ...init, dispatcher: agent } as RequestInit);
