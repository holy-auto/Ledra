/**
 * RFC3161 タイムスタンプ クライアント（汎用）。
 *
 * 設計: docs/parts-installation-integrity-design.md §6.4.3b
 *
 * 任意の RFC3161 準拠 TSA（国内 JIPDEC 認定TS局を含む）に対し、
 * TimeStampReq(DER) を application/timestamp-query で POST し、
 * TimeStampResp から TimeStampToken(CMS) と genTime を取り出す。
 * ベンダ固有 SDK に依存しない。
 */

import * as asn1js from "asn1js";
import { withRetry } from "@/lib/http/withRetry";

/** SHA-256 の OID。 */
const SHA256_OID = "2.16.840.1.101.3.4.2.1";

/** Uint8Array を（型上も）確実な ArrayBuffer にコピーする。asn1js が要求する型に合わせる。 */
function toArrayBuffer(u8: Uint8Array): ArrayBuffer {
  const ab = new ArrayBuffer(u8.byteLength);
  new Uint8Array(ab).set(u8);
  return ab;
}

function hexToArrayBuffer(hex: string): ArrayBuffer {
  const clean = hex.trim().toLowerCase();
  if (!/^[0-9a-f]*$/.test(clean) || clean.length % 2 !== 0) {
    throw new Error("hexToArrayBuffer: invalid hex");
  }
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return bytes.buffer;
}

/**
 * TimeStampReq(DER) を構築する。
 *
 *   TimeStampReq ::= SEQUENCE {
 *     version        INTEGER { v1(1) },
 *     messageImprint SEQUENCE {
 *       hashAlgorithm  AlgorithmIdentifier,   -- SHA-256
 *       hashedMessage  OCTET STRING },
 *     nonce          INTEGER OPTIONAL,
 *     certReq        BOOLEAN DEFAULT FALSE }
 */
export function buildTimeStampRequest(
  hashHex: string,
  opts: { certReq?: boolean; nonce?: Uint8Array } = {},
): Uint8Array {
  const digest = hexToArrayBuffer(hashHex);

  const messageImprint = new asn1js.Sequence({
    value: [
      new asn1js.Sequence({
        value: [new asn1js.ObjectIdentifier({ value: SHA256_OID }), new asn1js.Null()],
      }),
      new asn1js.OctetString({ valueHex: digest }),
    ],
  });

  const value: asn1js.AsnType[] = [new asn1js.Integer({ value: 1 }), messageImprint];

  if (opts.nonce && opts.nonce.length > 0) {
    // 先頭ビットが立つと負数扱いになるため 0x00 を前置して正の整数にする
    const n = opts.nonce[0] & 0x80 ? new Uint8Array([0, ...opts.nonce]) : opts.nonce;
    value.push(new asn1js.Integer({ valueHex: toArrayBuffer(n) }));
  }

  // certReq=true: トークンに署名証明書を含めてもらう（検証を自己完結させる）
  value.push(new asn1js.Boolean({ value: opts.certReq ?? true }));

  const req = new asn1js.Sequence({ value });
  return new Uint8Array(req.toBER(false));
}

export interface TimeStampResult {
  /** TimeStampToken（CMS ContentInfo）DER。保存は bytea。 */
  token: Buffer;
  /** TSTInfo.genTime（無ければ受信時刻にフォールバック）。 */
  genTime: string;
}

/**
 * TimeStampResp(DER) を解析し、token と genTime を取り出す。
 *   TimeStampResp ::= SEQUENCE { status PKIStatusInfo, timeStampToken ContentInfo OPTIONAL }
 *   PKIStatusInfo  ::= SEQUENCE { status PKIStatus(INTEGER), ... }
 * status: 0=granted, 1=grantedWithMods は成功。
 */
export function parseTimeStampResponse(der: Uint8Array): TimeStampResult {
  const { result } = asn1js.fromBER(toArrayBuffer(der));
  const top = result as asn1js.Sequence;
  if (!(top instanceof asn1js.Sequence) || top.valueBlock.value.length < 1) {
    throw new Error("RFC3161: malformed TimeStampResp");
  }

  const statusInfo = top.valueBlock.value[0] as asn1js.Sequence;
  const statusInt = statusInfo.valueBlock.value[0] as asn1js.Integer;
  const status = Number(statusInt.valueBlock.valueDec);
  if (status !== 0 && status !== 1) {
    throw new Error(`RFC3161: TSA rejected request (PKIStatus=${status})`);
  }

  const token = top.valueBlock.value[1];
  if (!token) throw new Error("RFC3161: response has no timeStampToken");
  const tokenDer = Buffer.from(token.toBER(false));

  let genTime: string;
  try {
    genTime = extractGenTime(token as asn1js.Sequence).toISOString();
  } catch {
    genTime = new Date().toISOString(); // フォールバック: 受信時刻
  }

  return { token: tokenDer, genTime };
}

/**
 * TimeStampToken(CMS=ContentInfo) から TSTInfo を取り出す。
 * ContentInfo → [0]SignedData → encapContentInfo.eContent(OCTET STRING) → TSTInfo。
 *
 * TSTInfo ::= SEQUENCE { version, policy OID, messageImprint, serialNumber, genTime GeneralizedTime, ... }
 */
function tstInfoFromContentInfo(contentInfo: asn1js.Sequence): asn1js.Sequence {
  // ContentInfo ::= SEQUENCE { contentType OID, content [0] EXPLICIT ANY }
  const content = contentInfo.valueBlock.value[1] as asn1js.Constructed;
  const signedData = content.valueBlock.value[0] as asn1js.Sequence;
  // SignedData ::= SEQUENCE { version, digestAlgorithms SET, encapContentInfo SEQUENCE, ... }
  const encap = signedData.valueBlock.value[2] as asn1js.Sequence;
  // EncapsulatedContentInfo ::= SEQUENCE { eContentType OID, eContent [0] EXPLICIT OCTET STRING }
  const eContentExplicit = encap.valueBlock.value[1] as asn1js.Constructed;
  const eContent = eContentExplicit.valueBlock.value[0] as asn1js.OctetString;
  const tstDer = eContent.valueBlock.valueHexView;
  const { result } = asn1js.fromBER(toArrayBuffer(tstDer));
  return result as asn1js.Sequence;
}

/** TSTInfo.genTime（index 4）を Date で取り出す。 */
function extractGenTime(contentInfo: asn1js.Sequence): Date {
  const tstInfo = tstInfoFromContentInfo(contentInfo);
  const genTime = tstInfo.valueBlock.value[4] as asn1js.GeneralizedTime;
  return genTime.toDate();
}

/**
 * TimeStampToken の TSTInfo.messageImprint.hashedMessage を hex(小文字) で取り出す。
 * 「TSA が我々の要求ハッシュにタイムスタンプを付けたか」を呼び出し側が検証するために使う。
 * 解析不能な場合は null を返す（構造差のある正当なトークンを過度に拒否しないため）。
 *
 *   MessageImprint ::= SEQUENCE { hashAlgorithm AlgorithmIdentifier, hashedMessage OCTET STRING }
 */
export function extractTimestampedHashHex(tokenDer: Uint8Array): string | null {
  try {
    const { result } = asn1js.fromBER(toArrayBuffer(tokenDer));
    const tstInfo = tstInfoFromContentInfo(result as asn1js.Sequence);
    const messageImprint = tstInfo.valueBlock.value[2] as asn1js.Sequence;
    const hashedMessage = messageImprint.valueBlock.value[1] as asn1js.OctetString;
    const hex = Buffer.from(hashedMessage.valueBlock.valueHexView).toString("hex").toLowerCase();
    return hex.length > 0 ? hex : null;
  } catch {
    return null;
  }
}

/**
 * TSA に問い合わせてタイムスタンプトークンを取得する。
 * 失敗時は例外（黙って無署名にしない）。
 */
export async function fetchTimestamp(
  tsaUrl: string,
  hashHex: string,
  opts: { username?: string; password?: string; timeoutMs?: number } = {},
): Promise<TimeStampResult> {
  const wantHex = hashHex.trim().toLowerCase();

  // 外向き HTTP は withRetry（指数バックオフ＋per-key circuit breaker）を経由する。
  // nonce/controller は各リトライで作り直すため thunk 内で生成する。
  return withRetry("parts-tsa", async () => {
    const nonce = new Uint8Array(16);
    crypto.getRandomValues(nonce);
    const reqDer = buildTimeStampRequest(hashHex, { certReq: true, nonce });

    const headers: Record<string, string> = {
      "Content-Type": "application/timestamp-query",
      Accept: "application/timestamp-reply",
    };
    if (opts.username) {
      headers.Authorization = `Basic ${Buffer.from(`${opts.username}:${opts.password ?? ""}`).toString("base64")}`;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 15_000);
    try {
      const res = await fetch(tsaUrl, {
        method: "POST",
        headers,
        body: reqDer as unknown as BodyInit,
        signal: controller.signal,
      });
      // status を載せて 5xx/429 を withRetry の既定 isRetryable に拾わせる。
      if (!res.ok) throw Object.assign(new Error(`RFC3161: TSA HTTP ${res.status}`), { status: res.status });
      const buf = new Uint8Array(await res.arrayBuffer());
      const result = parseTimeStampResponse(buf);

      // 改ざん防止: TSA が「我々の要求ハッシュ」にタイムスタンプを付けたか検証する。
      // （MITM/誤設定で別ハッシュのトークンを掴まされるのを防ぐ。解析不能時は寛容）。
      const stampedHex = extractTimestampedHashHex(result.token);
      if (stampedHex && stampedHex !== wantHex) {
        throw new Error("RFC3161: TSA response messageImprint does not match request");
      }
      return result;
    } finally {
      clearTimeout(timer);
    }
  });
}
