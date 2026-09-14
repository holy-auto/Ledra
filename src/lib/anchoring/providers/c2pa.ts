/**
 * C2PA content-provenance signing provider.
 *
 * Env: `C2PA_MODE` = "disabled" | "dev-signed" | "production"
 *      `PINATA_JWT` = Pinata JWT for IPFS pinning (optional)
 * Default: "disabled"
 *
 * - `disabled`: no-op, returns unsigned defaults.
 * - `dev-signed`: signs with an ephemeral self-signed ES256 cert (zero config).
 * - `production`: signs with cert/key from C2PA_SIGNER_CERT / C2PA_SIGNER_KEY env vars.
 *
 * The native @contentauth/c2pa-node module is loaded dynamically so a
 * binding failure on an unsupported platform falls back gracefully.
 */

import type { C2paResult, C2paManifestSummary } from "./types";

export type C2paMode = "disabled" | "dev-signed" | "production";

function getMode(): C2paMode {
  const raw = process.env.C2PA_MODE;
  if (raw === "dev-signed" || raw === "production") return raw;
  return "disabled";
}

const DISABLED_RESULT: C2paResult = {
  manifestCid: null,
  verified: false,
  signedBuffer: null,
  manifestSummary: null,
};

/** マニフェストの固定メタ（要約とアサーションで単一ソースにし drift を防ぐ）。 */
const CLAIM_GENERATOR = "Ledra/1.0";
const CLAIM_GENERATOR_NAME = "Ledra";
const CLAIM_GENERATOR_VERSION = "1.0";
const MANIFEST_TITLE = "Certificate Photo";

// Asserted C2PA Content Credentials Specification version. C2PA Conformance
// Program (Additional Conformance Requirements v0.2) requires this to appear as
// claim_generator_info.specVersion and to match the version on the CPL record /
// Intake Form.
const SPEC_VERSION = "2.4";

// IPTC DigitalSourceType: the depicted content is a real-life scene captured
// digitally. `c2pa.created` requires a digitalSourceType or it is rejected as
// `assertion.action.malformed` under a C2PA 2.x (claim v2) manifest.
const DIGITAL_SOURCE_TYPE_CAPTURE = "http://cv.iptc.org/newscodes/digitalsourcetype/digitalCapture";

/**
 * c2pa.actions に封入する行為台帳（要約と実アサーションで共有する唯一の定義）。
 * その実来歴を正直に宣言する。
 *
 * 先頭は `c2pa.created`（+digitalSourceType）。C2PA 2.x では `c2pa.opened`/`placed`/
 * `removed` は ingredient 参照が必須だが、Ledra は元写真を ingredient にできない
 * （プライバシーのため署名前に GPS を除去しており、除去前の原本を埋め込むと位置情報が
 * 再露出する）。よって `opened` は使わず、Ledra が生成した rendition を `created` とし、
 * 向き確定・再エンコード・EXIF/GPS 除去を後続の edit 系アクションで記録する。ingredient を
 * 要求しない `orientation`/`converted`/`edited` は検証を通る（実測で確認）。
 */
const CREATED_ACTION = { action: "c2pa.created", digitalSourceType: DIGITAL_SOURCE_TYPE_CAPTURE };
const ORIENTATION_ACTION = { action: "c2pa.orientation", softwareAgent: "sharp" };
const CONVERTED_ACTION = { action: "c2pa.converted", softwareAgent: "sharp" };
// EXIF/GPS metadata removed for privacy before signing.
const EDITED_REMOVE_METADATA_ACTION = { action: "c2pa.edited", parameters: { name: "exif_gps_metadata_removed" } };

type ManifestAction = {
  action: string;
  digitalSourceType?: string;
  softwareAgent?: string;
  parameters?: { name?: string };
};

/**
 * 署名対象に実際に行われた変換の結果。upload パイプライン（imageExif）から伝搬し、
 * **効果のあったアクションだけ**を台帳に載せるために使う。no-op を主張しない。
 * - reencoded: sharp の再エンコードが走った（fallback で原本をそのまま署名したときは false）。
 * - orientationApplied: EXIF Orientation ≠ 1 を実際に焼き込んだ。
 * - metadataRemoved: 元に EXIF/GPS があり、実際に除去した。
 */
export interface TransformOutcome {
  reencoded: boolean;
  orientationApplied: boolean;
  metadataRemoved: boolean;
}

/** 通常経路（全変換が有効）の既定値。テストや変換情報を持たない呼び出しの後方互換用。 */
const FULL_TRANSFORM: TransformOutcome = { reencoded: true, orientationApplied: true, metadataRemoved: true };

/**
 * 実際に効果のあった行為だけを台帳にする。`c2pa.created`（camera-only 入力なので常時）に加え、
 * orientation/converted/edited は各 outcome が true のときだけ載せる。fallback（reencoded=false）
 * では `c2pa.created` のみ。順序は created → orientation → converted → edited。
 */
function buildActions(o: TransformOutcome): ManifestAction[] {
  const actions: ManifestAction[] = [CREATED_ACTION];
  if (o.orientationApplied) actions.push(ORIENTATION_ACTION);
  if (o.reencoded) actions.push(CONVERTED_ACTION);
  if (o.metadataRemoved) actions.push(EDITED_REMOVE_METADATA_ACTION);
  return actions;
}

/** actions 台帳を要約文字列に落とす（parameters.name があれば `action:name`）。 */
function summarizeActions(o: TransformOutcome): string[] {
  return buildActions(o).map((a) => (a.parameters?.name ? `${a.action}:${a.parameters.name}` : a.action));
}

/** allActionsIncluded は「列挙した行為が実施した全て」＝再エンコードが走ったとき true。 */
function allActionsIncluded(o: TransformOutcome): boolean {
  return o.reencoded;
}

/**
 * 署名時に確定するマニフェスト要約を組み立てる純関数（読み戻し不要・テスト可能）。
 * signC2pa が実際に封入する内容と同じソース（MANIFEST_ACTIONS/固定メタ/binding）から作る。
 */
export function buildC2paManifestSummary(
  mode: "dev-signed" | "production",
  binding?: CaptureBinding,
  outcome: TransformOutcome = FULL_TRANSFORM,
): C2paManifestSummary {
  return {
    claimGenerator: CLAIM_GENERATOR,
    title: MANIFEST_TITLE,
    signerMode: mode,
    specVersion: SPEC_VERSION,
    allActionsIncluded: allActionsIncluded(outcome),
    actions: summarizeActions(outcome),
    binding: {
      certPublicId: binding?.publicId?.trim() || null,
      vin: binding?.vin?.trim() || null,
      tsaTimestamp: binding?.tsaTimestamp || null,
      // 生の nonce は残さず、封入した事実だけを真偽で記録する。
      nonceSealed: !!(binding?.captureNonce && binding.captureNonce.trim()),
    },
  };
}

/**
 * Pin a buffer to IPFS via Pinata and return its CID.
 * Returns null on failure (non-blocking).
 */
async function pinToPinata(signedBuffer: Buffer): Promise<string | null> {
  const jwt = process.env.PINATA_JWT;
  if (!jwt) return null;

  try {
    const blob = new Blob([new Uint8Array(signedBuffer)]);
    const form = new FormData();
    form.append("file", blob, "c2pa-manifest.bin");
    form.append("pinataMetadata", JSON.stringify({ name: `ledra-c2pa-${Date.now()}` }));

    const res = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
      method: "POST",
      headers: { Authorization: `Bearer ${jwt}` },
      body: form,
    });

    if (!res.ok) {
      console.error(`[c2pa] Pinata returned ${res.status}`);
      return null;
    }

    const json = await res.json();
    const cid: string | undefined = json?.IpfsHash;
    if (!cid) {
      console.error("[c2pa] Pinata response missing IpfsHash");
      return null;
    }

    return cid;
  } catch (err) {
    console.error("[c2pa] IPFS pinning failed", err);
    return null;
  }
}

/**
 * Capture-binding payload sealed into the manifest so a signed photo cannot be
 * silently moved to a different certificate/vehicle or replayed for another
 * capture. All fields optional — only the ones present are asserted.
 */
export interface CaptureBinding {
  /** Certificate public_id this photo belongs to. */
  publicId?: string | null;
  /** Vehicle VIN the certificate is for. */
  vin?: string | null;
  /** Server-issued single-use capture nonce. */
  captureNonce?: string | null;
  /** RFC3161 TSA genTime over the capture hash, if a TSA seal was obtained. */
  tsaTimestamp?: string | null;
}

/**
 * Sign an image buffer with a C2PA manifest.
 *
 * On success the returned `signedBuffer` contains the image with the
 * manifest embedded.  The caller should upload this buffer to storage
 * instead of the original.
 *
 * `binding` seals certificate/vehicle/nonce/time into a custom assertion.
 * `outcome` = which transforms actually had an effect on this buffer (from
 * imageExif). Only effective actions are asserted, so the manifest never
 * certifies a no-op (e.g. `exif_gps_metadata_removed` when there was no
 * metadata, or `c2pa.orientation` when there was no orientation to normalize).
 * On the fallback where sharp failed (reencoded=false) only `c2pa.created` is
 * asserted and allActionsIncluded=false.
 */
export async function signC2pa(
  buffer: Buffer,
  mime: string,
  binding?: CaptureBinding,
  outcome: TransformOutcome = FULL_TRANSFORM,
): Promise<C2paResult> {
  const mode = getMode();
  if (mode === "disabled") return DISABLED_RESULT;

  try {
    const { createC2paSigner } = await import("./c2paSigner");
    const signer = await createC2paSigner(mode);
    if (!signer) return DISABLED_RESULT;

    const { Builder } = await import("@contentauth/c2pa-node");

    // c2pa-node 0.6.x では Builder のコンストラクタはネイティブハンドルを取る内部用で、
    // マニフェスト定義から作るには静的ファクトリ `Builder.withJson(...)` を使う。
    // `new Builder({...})` は旧APIで、0.6.x では addAssertion 時に neon downcast エラーで
    // throw → signC2pa の catch で握られ「署名されない(DISABLED)」に fail-open してしまう。
    // claim_generator_info (v2 form) carries specVersion — required by the C2PA
    // Conformance Program for Spec 2.4+ so validators can confirm the asserted
    // version matches the CPL record.
    const builder = Builder.withJson({
      claim_generator_info: [
        { name: CLAIM_GENERATOR_NAME, version: CLAIM_GENERATOR_VERSION, specVersion: SPEC_VERSION },
      ],
      title: MANIFEST_TITLE,
    });

    // Record the real provenance, asserting ONLY the actions that actually had an
    // effect on this buffer (from `outcome`): c2pa.created (camera-only input),
    // then c2pa.converted (re-encode), c2pa.orientation (only if an EXIF
    // orientation was baked in), and c2pa.edited:exif_gps_metadata_removed (only
    // if the source carried EXIF/GPS that was removed). A no-op is never asserted,
    // so the manifest never certifies e.g. "GPS metadata removed" for an image
    // that had none. On the fallback where sharp failed, only c2pa.created is
    // asserted and allActionsIncluded=false. `c2pa.opened` cannot be used here
    // (claim v2 requires an ingredient Ledra can't embed — see CREATED_ACTION).
    // The C2PA Conformance Program (Additional Conformance Requirements v0.2)
    // requires actions-map-v2 to carry allActionsIncluded (true|false).
    builder.addAssertion("c2pa.actions", {
      actions: buildActions(outcome) as unknown as Record<string, unknown>[],
      allActionsIncluded: allActionsIncluded(outcome),
    });

    // Seal the capture context into the manifest: which certificate/vehicle this
    // photo is for, the single-use capture nonce, and the TSA time. This binds
    // the signed image to one certificate so it cannot be reused elsewhere, and
    // ties it to a nonce that only existed after that certificate was created.
    const bindingEntries = Object.entries({
      cert_public_id: binding?.publicId ?? undefined,
      vin: binding?.vin ?? undefined,
      capture_nonce: binding?.captureNonce ?? undefined,
      tsa_timestamp: binding?.tsaTimestamp ?? undefined,
    }).filter(([, v]) => v != null && v !== "");
    if (bindingEntries.length > 0) {
      builder.addAssertion("com.ledra.capture", Object.fromEntries(bindingEntries));
    }

    const input = { buffer, mimeType: mime };
    const output: { buffer: Buffer | null } = { buffer: null };

    await builder.sign(signer, input, output);

    if (!output.buffer) {
      console.error("[c2pa] signing produced no output buffer");
      return DISABLED_RESULT;
    }

    // Pin signed manifest to IPFS (non-blocking on failure)
    const manifestCid = await pinToPinata(output.buffer);

    return {
      manifestCid,
      verified: true,
      signedBuffer: output.buffer,
      // 封入した内容から決定的に作る要約（読み戻し不要）。DBに保存し UI で表示する。
      manifestSummary: buildC2paManifestSummary(mode, binding, outcome),
    };
  } catch (err) {
    console.error("[c2pa] signing failed, falling back to unsigned", err);
    return DISABLED_RESULT;
  }
}
