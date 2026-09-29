import { Agent, fetch as undiciFetch } from "undici";

/**
 * TLS 1.3 未満を拒否する fetch。Backend → Supabase（Postgres REST / Storage / Auth）の
 * サブシステム間通信に使う（C2PA GPSA O.5 / Req 5.1: TLS v1.3 以上で保護）。
 * 相手が 1.2 までしか話さなければハンドシェイクで失敗し、平文や旧版へは落ちない。
 *
 * Node 組み込みの fetch に undici パッケージの dispatcher を渡すと版ずれで壊れうるので、
 * fetch も同じパッケージのものを使う。
 * ponytail: Node ランタイム専用（Edge では undici を読めない）。getSupabaseAdmin は
 * Node の route からしか呼ばれない前提。
 */
const agent = new Agent({ connect: { minVersion: "TLSv1.3" } });

export const tls13Fetch = ((input: Parameters<typeof undiciFetch>[0], init?: Parameters<typeof undiciFetch>[1]) =>
  undiciFetch(input, { ...init, dispatcher: agent })) as unknown as typeof fetch;
