/**
 * 帳票（請求書等）の完全性封印 — 電子帳簿保存法「真実性の確保」対応。
 *
 * 確定（draft→sent）した帳票の不変フィールドから SHA-256 ハッシュを算出し、
 * 可能なら RFC3161 タイムスタンプ（第三者による存在時刻証明）を付けて
 * `documents.meta_json.integrity_seal` に保存する。
 *
 * - ハッシュ単体でも「確定後に内容が改ざんされていないか」を後から再計算で検証でき、
 *   送付済み帳票が編集不可（isDocumentEditable=false）である運用と合わせて
 *   「改ざん防止できるシステム」= 真実性の確保を満たす基盤になる。
 * - タイムスタンプは写真 TSA と同じ RFC3161 機構（fetchTimestamp）を流用する。
 *   専用 env（DOCUMENT_TSA_*）が無ければ、既に有効化済みの写真 TSA（PHOTO_TSA_*）に
 *   フォールバックする。TS 局未契約 / 失敗 / 締切超過はいずれもハッシュのみの封印へ
 *   素直に degrade し、付いていない TS を付いていると騙らない。
 *
 * この封印は確定レスポンス送出後の after() から best-effort で呼ばれる想定であり、
 * 失敗しても確定自体（status=sent）は巻き戻さない。
 */

import { createHash } from "node:crypto";
import { fetchTimestamp } from "@/lib/parts/rfc3161";
import type { SupabaseClient } from "@supabase/supabase-js";

/** 封印スキーマのバージョン（後方互換に備えて検証側が分岐できるように保持）。 */
const SEAL_VERSION = 1;

/**
 * meta_json 内で「サーバのみが書き込む」予約キー。
 * クライアントが任意 meta_json を送れる（帳票 create/update）ため、この封印キーを
 * 入力から必ず剥がさないと、偽の timestamp_token_b64 を仕込んで TSA 未接触のまま
 * 「タイムスタンプ付き封印」バッジを騙れてしまう（trust boundary）。
 */
export const INTEGRITY_SEAL_KEY = "integrity_seal";

/** クライアント由来 meta_json から封印キーを除去する。 */
export function stripClientIntegritySeal<T extends Record<string, unknown>>(meta: T | null | undefined): T {
  const src = (meta ?? {}) as T;
  if (!(INTEGRITY_SEAL_KEY in src)) return src;
  const clone = { ...src } as Record<string, unknown>;
  delete clone[INTEGRITY_SEAL_KEY];
  return clone as T;
}

/** TSA 取得の per-attempt タイムアウトと、リトライ込み総時間の締切（fail-open）。 */
const DOC_TSA_ATTEMPT_MS = 3_000;
const DOC_TSA_DEADLINE_MS = 5_000;

/** ハッシュ対象にする「取引の本質」= 確定後に変わってはならないフィールド。 */
export interface SealableDocument {
  doc_type: string;
  doc_number: string;
  issued_at: string | null;
  due_date: string | null;
  customer_id: string | null;
  recipient_name: string | null;
  subtotal: number | null;
  tax: number | null;
  total: number | null;
  tax_rate: number | null;
  tax_breakdown?: unknown;
  items_json?: unknown;
  is_invoice_compliant?: boolean | null;
}

export interface IntegritySeal {
  version: number;
  algo: "SHA-256";
  /** 確定時点の内容ハッシュ（hex 小文字）。後から再計算して照合する。 */
  hash_sha256: string;
  /** 封印を作成したサーバ時刻（ISO8601）。 */
  sealed_at: string;
  /** RFC3161 TimeStampToken（CMS DER）を base64 で格納。TS 未取得なら null。 */
  timestamp_token_b64: string | null;
  /** TSTInfo.genTime（第三者が保証する時刻）。TS 未取得なら null。 */
  timestamp_at: string | null;
  /** TS 局のホスト/識別子。TS 未取得なら null。 */
  timestamp_authority: string | null;
}

/**
 * オブジェクト/配列のキー順に依存しない安定シリアライズ。
 * ponytail: jsonb 由来のオブジェクトはキー順が保証されないため、再帰的にキーを
 * ソートしてから文字列化する。循環参照は想定しない（DB 由来のプレーンデータのみ）。
 */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
}

/** 帳票の不変フィールドから確定内容ハッシュ（SHA-256 hex）を算出する。 */
export function computeDocumentContentHash(doc: SealableDocument): string {
  // 明示的な固定順のオブジェクトにしてから安定シリアライズ（列追加時に既存ハッシュを
  // 壊さないよう、対象フィールドは意図的に列挙する）。
  const canonical = {
    doc_type: doc.doc_type,
    doc_number: doc.doc_number,
    issued_at: doc.issued_at ?? null,
    due_date: doc.due_date ?? null,
    customer_id: doc.customer_id ?? null,
    recipient_name: doc.recipient_name ?? null,
    subtotal: Number(doc.subtotal ?? 0),
    tax: Number(doc.tax ?? 0),
    total: Number(doc.total ?? 0),
    tax_rate: Number(doc.tax_rate ?? 0),
    tax_breakdown: doc.tax_breakdown ?? null,
    items_json: doc.items_json ?? null,
    is_invoice_compliant: !!doc.is_invoice_compliant,
  };
  return createHash("sha256").update(stableStringify(canonical), "utf8").digest("hex");
}

/** 帳票 TSA の env（専用が無ければ有効化済みの写真 TSA にフォールバック）。 */
function resolveDocTsaConfig(): { url: string; authority?: string; username?: string; password?: string } | null {
  const prefix = process.env.DOCUMENT_TSA_URL ? "DOCUMENT_TSA" : "PHOTO_TSA";
  const enabled = (process.env[`${prefix}_ENABLED`] ?? "").toLowerCase() === "true";
  const url = process.env[`${prefix}_URL`];
  if (!enabled || !url) return null;
  return {
    url,
    authority: process.env[`${prefix}_AUTHORITY`],
    username: process.env[`${prefix}_USERNAME`],
    password: process.env[`${prefix}_PASSWORD`],
  };
}

/**
 * ハッシュに対してタイムスタンプトークンを取得する。
 * 未設定 / 失敗 / 締切超過はいずれも null（確定を止めない fail-open）。
 */
async function requestDocumentTimestamp(
  hashHex: string,
): Promise<{ token: Buffer; authority: string; timestampAt: string } | null> {
  const cfg = resolveDocTsaConfig();
  if (!cfg) return null;
  try {
    const authority = cfg.authority || new URL(cfg.url).host;
    const fetchP = fetchTimestamp(cfg.url, hashHex, {
      username: cfg.username,
      password: cfg.password,
      timeoutMs: DOC_TSA_ATTEMPT_MS,
      // 写真 / 部品確定署名とは別の circuit breaker key（相互に開かないよう分離）。
      retryKey: "document-tsa",
    });
    const deadlineP = new Promise<null>((resolve) => setTimeout(() => resolve(null), DOC_TSA_DEADLINE_MS));
    const result = await Promise.race([fetchP, deadlineP]);
    if (!result) return null;
    return { token: result.token, authority, timestampAt: result.genTime };
  } catch (err) {
    console.warn(
      "[document-tsa] timestamp request failed, degrading to hash-only seal",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

/** 確定内容ハッシュ＋（可能なら）タイムスタンプから封印オブジェクトを組み立てる。 */
export async function buildIntegritySeal(doc: SealableDocument): Promise<IntegritySeal> {
  const hash = computeDocumentContentHash(doc);
  const ts = await requestDocumentTimestamp(hash);
  return {
    version: SEAL_VERSION,
    algo: "SHA-256",
    hash_sha256: hash,
    sealed_at: new Date().toISOString(),
    timestamp_token_b64: ts ? ts.token.toString("base64") : null,
    timestamp_at: ts ? ts.timestampAt : null,
    timestamp_authority: ts ? ts.authority : null,
  };
}

/**
 * 確定した帳票に封印を付けて保存する（best-effort）。
 * 既存 meta_json を保持したまま integrity_seal をマージする。既に封印済み
 * （meta_json.integrity_seal あり）なら二重封印しない。
 */
export async function sealDocumentOnFinalize(
  admin: SupabaseClient,
  tenantId: string,
  doc: SealableDocument & { id: string; meta_json?: unknown },
): Promise<void> {
  const existingMeta = (doc.meta_json ?? {}) as Record<string, unknown>;
  if (existingMeta.integrity_seal) return; // 冪等: 確定は一度きりのはずだが二重封印を防ぐ

  const seal = await buildIntegritySeal(doc);
  const { error } = await admin
    .from("documents")
    .update({ meta_json: { ...existingMeta, integrity_seal: seal } })
    .eq("id", doc.id)
    .eq("tenant_id", tenantId);
  if (error) {
    console.error("[document-seal] failed to persist integrity_seal (non-blocking)", error);
  }
}

/** 封印に必要な列（他の確定パスが id だけ持つ場合にこの列集合で読み直す）。 */
const SEALABLE_COLUMNS =
  "id, doc_type, doc_number, issued_at, due_date, customer_id, recipient_name, subtotal, tax, total, tax_rate, tax_breakdown, items_json, is_invoice_compliant, meta_json";

/**
 * id 起点で帳票を読み直してから封印する（best-effort）。
 * 共有送付など、確定行の全列を手元に持たない確定パス用。
 */
export async function sealDocumentById(admin: SupabaseClient, tenantId: string, id: string): Promise<void> {
  const { data, error } = await admin
    .from("documents")
    .select(SEALABLE_COLUMNS)
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .single();
  if (error || !data) {
    console.error("[document-seal] failed to load document for sealing (non-blocking)", error);
    return;
  }
  await sealDocumentOnFinalize(admin, tenantId, data as SealableDocument & { id: string; meta_json?: unknown });
}
