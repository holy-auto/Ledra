/**
 * Apple App Attest 検証（iOS 端末アテステーション）。
 *
 * Apple の手順に従い、端末の Secure Enclave が生成した attestation object を検証する:
 *   1. CBOR で attestation object を復号（fmt=apple-appattest / attStmt.x5c / authData）
 *   2. 証明書チェーン credCert → 中間CA → Apple App Attest Root CA を検証
 *   3. nonce = SHA256(authData || SHA256(challenge)) を計算し、credCert の
 *      Apple 拡張 (OID 1.2.840.113635.100.8.2) に埋め込まれた nonce と一致を確認
 *      （＝サーバ発行の撮影nonceで生成された attestation であることの証明）
 *   4. credCert 公開鍵の SHA256 == keyId（authData の credentialId）を確認
 *   5. authData の rpIdHash == SHA256("TEAMID.bundleID") / aaguid が App Attest / を確認
 *
 * fail-closed: 設定不足・チェーン不正・nonce 不一致など、どこかで失敗したら未検証で返す。
 *
 * Root CA は egress ポリシー上ここでは取得できないため **運用が env で供給** する
 * （`APP_ATTEST_ROOT_CA_PEM` に Apple 公開の App Attest Root CA を設定）。未設定なら
 * fail-closed。DEVICE_ATTESTATION_ENABLED は実機検証（Phase 3）まで false のままにする。
 *
 * Env: APP_ATTEST_TEAM_ID / APP_ATTEST_BUNDLE_ID / APP_ATTEST_ENV(production|development)
 *      APP_ATTEST_ROOT_CA_PEM
 */

import { createHash, X509Certificate } from "crypto";

/** Apple App Attest 拡張 OID（nonce を保持）。 */
const APPLE_NONCE_OID = "1.2.840.113635.100.8.2";

/** aaguid（authData 内 16 byte）。本番/開発で異なる。 */
export const APP_ATTEST_AAGUID = {
  production: Buffer.from("appattest\0\0\0\0\0\0\0", "binary"),
  development: Buffer.from("appattestdevelop", "binary"),
} as const;

export interface AppAttestVerification {
  verified: boolean;
  /** 検証成功時: 端末鍵の識別子(=keyId) hex。replay/farm 検知の安定キー。 */
  deviceKeyHash: string | null;
  reason: string | null;
}

// ── 純粋ヘルパ（単体テスト対象）─────────────────────────────────────────

/** rpId ハッシュ = SHA256("TEAMID.bundleID")。authData 先頭32byteと一致するべき値。 */
export function rpIdHash(teamId: string, bundleId: string): Buffer {
  return createHash("sha256").update(`${teamId}.${bundleId}`).digest();
}

/** attestation nonce = SHA256(authData || SHA256(challenge))。 */
export function computeAttestationNonce(authData: Buffer, clientDataHash: Buffer): Buffer {
  return createHash("sha256")
    .update(Buffer.concat([authData, clientDataHash]))
    .digest();
}

export interface ParsedAuthData {
  rpIdHash: Buffer;
  flags: number;
  signCount: number;
  aaguid: Buffer;
  credentialId: Buffer;
}

/**
 * authData をパースする。レイアウト:
 *   [0..32) rpIdHash | [32] flags | [33..37) signCount(uint32 BE) |
 *   [37..53) aaguid | [53..55) credIdLen(uint16 BE) | [55..55+len) credentialId
 * 不正長は null。
 */
export function parseAuthData(buf: Buffer): ParsedAuthData | null {
  if (buf.length < 55) return null;
  const credIdLen = buf.readUInt16BE(53);
  if (buf.length < 55 + credIdLen) return null;
  return {
    rpIdHash: buf.subarray(0, 32),
    flags: buf[32],
    signCount: buf.readUInt32BE(33),
    aaguid: buf.subarray(37, 53),
    credentialId: buf.subarray(55, 55 + credIdLen),
  };
}

// ── メイン検証 ─────────────────────────────────────────────────────────

interface AttestationEnvelope {
  keyId: string; // base64
  attestation: string; // base64 (CBOR attestation object)
}

function parseEnvelope(token: string): AttestationEnvelope | null {
  try {
    const obj = JSON.parse(token);
    if (typeof obj?.keyId === "string" && typeof obj?.attestation === "string") {
      return { keyId: obj.keyId, attestation: obj.attestation };
    }
  } catch {
    /* not JSON */
  }
  return null;
}

/** SPKI(DER) から生の非圧縮ECポイント(0x04||X||Y, 65byte) を取り出す。 */
function rawEcPoint(cert: X509Certificate): Buffer | null {
  const spki = cert.publicKey.export({ type: "spki", format: "der" }) as Buffer;
  // P-256 SPKI の末尾 65byte が uncompressed point (0x04||X||Y)。
  if (spki.length < 65) return null;
  const point = spki.subarray(spki.length - 65);
  return point[0] === 0x04 ? point : null;
}

/** credCert の Apple nonce 拡張 (OID) から 32byte nonce を取り出す。 */
async function extractNonceExtension(der: Buffer): Promise<Buffer | null> {
  const x509 = await import("@peculiar/x509");
  // @peculiar は標準 ArrayBuffer ビューを要求するので Node Buffer をコピーして渡す。
  const cert = new x509.X509Certificate(new Uint8Array(der));
  const ext = cert.getExtension(APPLE_NONCE_OID);
  if (!ext) return null;
  // 拡張値は SEQUENCE { [1] EXPLICIT OCTET STRING nonce(32) }。
  // 末尾32byteが nonce（DER の固定レイアウト）。厳密パースは asn1js でも可。
  const value = Buffer.from(ext.value);
  if (value.length < 32) return null;
  return value.subarray(value.length - 32);
}

export async function verifyAppAttest(
  token: string,
  expectedNonce: string | null | undefined,
): Promise<AppAttestVerification> {
  const teamId = process.env.APP_ATTEST_TEAM_ID;
  const bundleId = process.env.APP_ATTEST_BUNDLE_ID;
  const rootPem = process.env.APP_ATTEST_ROOT_CA_PEM;
  const env = (process.env.APP_ATTEST_ENV ?? "production") === "development" ? "development" : "production";
  const fail = (reason: string): AppAttestVerification => ({ verified: false, deviceKeyHash: null, reason });

  if (!teamId || !bundleId) return fail("app_attest_not_configured");
  if (!rootPem) return fail("app_attest_root_ca_missing");
  if (!expectedNonce) return fail("missing_nonce");

  const envelope = parseEnvelope(token);
  if (!envelope) return fail("bad_envelope");

  try {
    const { decode } = await import("cbor-x");
    const att = decode(Buffer.from(envelope.attestation, "base64")) as {
      fmt?: string;
      attStmt?: { x5c?: Buffer[] };
      authData?: Buffer;
    };
    if (att?.fmt !== "apple-appattest") return fail("bad_fmt");
    const x5c = att.attStmt?.x5c;
    const authData = att.authData ? Buffer.from(att.authData) : null;
    if (!x5c || x5c.length < 2 || !authData) return fail("bad_attestation");

    const credCert = new X509Certificate(Buffer.from(x5c[0]));
    const intermediate = new X509Certificate(Buffer.from(x5c[1]));
    const root = new X509Certificate(rootPem);

    // (2) チェーン検証: credCert←intermediate←root、かつ各証明書が有効期間内。
    const now = Date.now();
    for (const c of [credCert, intermediate, root]) {
      if (now < Date.parse(c.validFrom) || now > Date.parse(c.validTo)) return fail("cert_expired");
    }
    if (!credCert.checkIssued(intermediate) || !credCert.verify(intermediate.publicKey)) {
      return fail("cred_cert_untrusted");
    }
    if (!intermediate.checkIssued(root) || !intermediate.verify(root.publicKey)) {
      return fail("intermediate_untrusted");
    }
    if (!root.checkIssued(root) || !root.verify(root.publicKey)) return fail("root_untrusted");

    // (3) nonce 束縛: SHA256(authData || SHA256(challenge)) == 拡張の nonce。
    const clientDataHash = createHash("sha256").update(expectedNonce).digest();
    const computedNonce = computeAttestationNonce(authData, clientDataHash);
    const extNonce = await extractNonceExtension(Buffer.from(credCert.raw));
    if (!extNonce || !computedNonce.equals(extNonce)) return fail("nonce_mismatch");

    // (4) 公開鍵ハッシュ == keyId(credentialId)。
    const point = rawEcPoint(credCert);
    if (!point) return fail("bad_public_key");
    const keyId = createHash("sha256").update(point).digest();

    // (5) authData: rpIdHash / aaguid / credentialId==keyId。
    const parsed = parseAuthData(authData);
    if (!parsed) return fail("bad_auth_data");
    if (!parsed.rpIdHash.equals(rpIdHash(teamId, bundleId))) return fail("rp_id_mismatch");
    if (!parsed.aaguid.equals(APP_ATTEST_AAGUID[env])) return fail("aaguid_mismatch");
    if (!parsed.credentialId.equals(keyId)) return fail("key_id_mismatch");

    // keyId は base64(envelope) とも一致するはず（クライアント申告との整合）。
    if (
      Buffer.from(envelope.keyId, "base64").length > 0 &&
      !parsed.credentialId.equals(Buffer.from(envelope.keyId, "base64"))
    ) {
      return fail("key_id_envelope_mismatch");
    }

    return { verified: true, deviceKeyHash: keyId.toString("hex"), reason: null };
  } catch (err) {
    console.warn("[app-attest] verify failed", err instanceof Error ? err.message : err);
    return fail("app_attest_error");
  }
}
