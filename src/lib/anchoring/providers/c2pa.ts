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
import { tls13Fetch } from "@/lib/net/tls13Fetch";

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

// IPTC DigitalSourceType for a perceptible transformation made by a deterministic
// (non-generative) algorithm — here sharp baking in the EXIF orientation. It
// describes the *transformation*, not the ingredient, so it stays true whatever the
// uploaded photo's own origin is.
const DIGITAL_SOURCE_TYPE_ALGORITHMIC = "http://cv.iptc.org/newscodes/digitalsourcetype/algorithmicallyEnhanced";

/** ingredient（アップロードされた原本）と c2pa.opened を結ぶラベル。 */
const PARENT_INGREDIENT_LABEL = "parent";

/**
 * c2pa.actions に封入する行為台帳（要約と実アサーションで共有する唯一の定義）。
 * その実来歴を正直に宣言する。
 *
 * 先頭は `c2pa.opened`＋parentOf ingredient（アップロードされた原本）。Ledra は Backend 型の
 * Generator Product で、撮影そのものはしない＝アセットを「生成」していないので `c2pa.created`
 * は主張できない（Conformance Program Administrator の指摘、2026-09-28）。原本を ingredient に
 * しても GPS は漏れない — ingredient は原本のハッシュ・形式・画素から作り直したサムネイルだけを
 * 持ち、EXIF/GPS は運ばない（実測: 原本 GPS あり → ingredient サムネイル・manifest JSON とも GPS なし）。
 * 原本が C2PA 付きなら、その manifest と検証結果が ingredient に入る（＝validate）。
 * `c2pa.opened` には digitalSourceType を付けない（Conformulator `no_dst_for_opened_action`）。
 */
const OPENED_ACTION = { action: "c2pa.opened", parameters: { ingredientIds: [PARENT_INGREDIENT_LABEL] } };
// c2pa.orientation は「知覚できる変換」なので digitalSourceType が必須（Conformulator
// `mandatory_dst_for_perceptible_transformations`）。
const ORIENTATION_ACTION = {
  action: "c2pa.orientation",
  softwareAgent: "sharp",
  digitalSourceType: DIGITAL_SOURCE_TYPE_ALGORITHMIC,
};
const CONVERTED_ACTION = { action: "c2pa.converted", softwareAgent: "sharp" };
// EXIF/GPS metadata removed for privacy before signing. `c2pa.edited.metadata`（メタデータのみの編集）を
// 使う。汎用の `c2pa.edited` は「editorial な意味に影響する編集」の定義で、画素は変えていないので合わない。
const EDITED_METADATA_ACTION = {
  action: "c2pa.edited.metadata",
  softwareAgent: "sharp",
  description: "EXIF/GPS metadata removed for privacy",
};

type ManifestAction = {
  action: string;
  digitalSourceType?: string;
  softwareAgent?: string;
  description?: string;
  parameters?: { ingredientIds: string[] };
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
 * 実際に効果のあった行為だけを台帳にする。`c2pa.opened`（原本を開いた＝常時）に加え、
 * orientation/converted/edited は各 outcome が true のときだけ載せる。fallback（reencoded=false）
 * では原本をそのまま署名するので `c2pa.opened` のみ。順序は opened → orientation → converted → edited。
 */
function buildActions(o: TransformOutcome): ManifestAction[] {
  const actions: ManifestAction[] = [OPENED_ACTION];
  if (o.orientationApplied) actions.push(ORIENTATION_ACTION);
  if (o.reencoded) actions.push(CONVERTED_ACTION);
  if (o.metadataRemoved) actions.push(EDITED_METADATA_ACTION);
  return actions;
}

/**
 * 原本（ingredient）の manifest store 内で、位置などの個人情報を持ちうるメタデータ系アサーション
 * （c2pa.metadata / stds.exif / stds.iptc / cawg.metadata 等）の JUMBF URI を列挙する。redaction 対象。
 * // ponytail: ラベル名の部分一致（metadata|exif|iptc|xmp）で判定する。新しいメタデータ系ラベルが
 * // 仕様に増えたらここを広げる（テスト: GPS 入り c2pa.metadata を持つ原本が漏れないこと）。
 */
export function metadataAssertionUris(store: unknown): string[] {
  const manifests = (store as { manifests?: Record<string, { assertions?: Array<{ label?: string }> }> } | null)
    ?.manifests;
  return Object.entries(manifests ?? {}).flatMap(([label, m]) =>
    (m.assertions ?? [])
      .map((a) => a.label ?? "")
      .filter((l) => /metadata|exif|iptc|xmp/i.test(l))
      .map((l) => `self#jumbf=/c2pa/${label}/c2pa.assertions/${l}`),
  );
}

/** actions 台帳を要約文字列（action 名の列）に落とす。 */
function summarizeActions(o: TransformOutcome): string[] {
  return buildActions(o).map((a) => a.action);
}

/**
 * allActionsIncluded: 列挙した行為が実施した全て。fallback でも原本をそのまま署名しただけ
 * （opened 以外に何もしていない）なので常に true。open-and-re-save の manifest では true が
 * 求められる（Conformulator `all_actions_included_opened`, Spec 2.4 §18.15.3）。
 */
const ALL_ACTIONS_INCLUDED = true;

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
    allActionsIncluded: ALL_ACTIONS_INCLUDED,
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

    const res = await tls13Fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
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
 * certifies a no-op (e.g. `c2pa.edited.metadata` when there was no
 * metadata, or `c2pa.orientation` when there was no orientation to normalize).
 * On the fallback where sharp failed (reencoded=false) the original is signed
 * as-is and only `c2pa.opened` is asserted.
 *
 * `original` = the bytes as uploaded (before EXIF/GPS removal). It becomes the
 * parentOf ingredient that `c2pa.opened` points to; defaults to `buffer` when the
 * caller has no separate original (tests, fallback).
 */
export async function signC2pa(
  buffer: Buffer,
  mime: string,
  binding?: CaptureBinding,
  outcome: TransformOutcome = FULL_TRANSFORM,
  original: Buffer = buffer,
): Promise<C2paResult> {
  const mode = getMode();
  if (mode === "disabled") return DISABLED_RESULT;

  try {
    const { createC2paSigner } = await import("./c2paSigner");
    const signer = await createC2paSigner(mode);
    if (!signer) return DISABLED_RESULT;

    const { Builder, Reader } = await import("@contentauth/c2pa-node");

    // Seal the capture context into the manifest (com.ledra.capture): which
    // certificate/vehicle this photo is for, the single-use capture nonce, and the
    // TSA time. This binds the signed image to one certificate so it cannot be
    // reused elsewhere, and ties it to a nonce that only existed after that
    // certificate was created.
    const bindingEntries = Object.entries({
      cert_public_id: binding?.publicId ?? undefined,
      vin: binding?.vin ?? undefined,
      capture_nonce: binding?.captureNonce ?? undefined,
      tsa_timestamp: binding?.tsaTimestamp ?? undefined,
    }).filter(([, v]) => v != null && v !== "");

    // Both assertions are made by Ledra itself, so they go in the manifest
    // definition with `created: true` (→ claim.created_assertions). Added via
    // builder.addAssertion they land in gathered_assertions, and the Conformulator
    // rubric fails `inception_action_position`: the inception action must be the
    // first item of the first actions assertion in created_assertions (Spec 2.2 §18.14.2).
    // The actions ledger lists only the transforms that took effect (see buildActions);
    // the Conformance Program (Additional Conformance Requirements v0.2) requires
    // allActionsIncluded, and claim_generator_info.specVersion matching the CPL record.
    // マニフェスト定義から作るには静的ファクトリ `Builder.withJson(...)` を使う
    // （旧 `new Builder({...})` は addAssertion 時に neon downcast エラーで fail-open した）。
    const builder = Builder.withJson({
      claim_generator_info: [
        { name: CLAIM_GENERATOR_NAME, version: CLAIM_GENERATOR_VERSION, specVersion: SPEC_VERSION },
      ],
      title: MANIFEST_TITLE,
      assertions: [
        {
          label: "c2pa.actions",
          created: true,
          data: { actions: buildActions(outcome), allActionsIncluded: ALL_ACTIONS_INCLUDED },
        },
        ...(bindingEntries.length > 0
          ? [{ label: "com.ledra.capture", created: true, data: Object.fromEntries(bindingEntries) }]
          : []),
      ],
    });
    // The uploaded original is the parentOf ingredient that c2pa.opened references.
    // c2pa-rs records its hash, format and a pixel-derived thumbnail (no EXIF/GPS),
    // and — if the original carries C2PA — its manifest plus validation results.
    await builder.addIngredient(
      JSON.stringify({ title: "Uploaded photo", relationship: "parentOf", label: PARENT_INGREDIENT_LABEL }),
      { buffer: original, mimeType: mime },
    );
    // If the original carries its own C2PA manifest (C2PA cameras/phones), that manifest is
    // copied into ours — and it can hold the shooting location in a metadata assertion,
    // which would bypass the EXIF/GPS removal. Redact every metadata-type assertion of the
    // ingredient's manifest store (C2PA redaction; c2pa-rs adds the c2pa.redacted action).
    // A read error is not swallowed: signing then fails closed (unsigned, not leaking).
    const parentStore = (await Reader.fromAsset({ buffer: original, mimeType: mime }))?.json();
    for (const uri of metadataAssertionUris(parentStore)) builder.addRedaction(uri, "c2pa.PII.present");

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
