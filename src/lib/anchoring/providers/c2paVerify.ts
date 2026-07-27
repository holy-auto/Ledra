/**
 * 外部（カメラ/他アプリ）が付けた C2PA Content Credential を、アップロード受信時に検証する。
 *
 * 重要（再エンコード衝突）: Ledra はアップロード時に EXIF strip + 再エンコード(sharp)するため、
 *   外部マニフェストはその時点で失われ dataHash も壊れる。よって外部検証は必ず
 *   **strip 前の原バイト**に対して行う（processUploadedPhoto の最初で呼ぶ）。
 *
 * fail-open: c2pa-node の読取が使えない/エラーでも例外を投げず present=false を返し、
 *   アップロードをブロックしない。@contentauth/c2pa-node は動的 import（未対応環境での
 *   binding 失敗を吸収）。API は v0.6.0 の Reader.fromAsset / reader.json() に準拠。
 */

export interface ExternalC2paResult {
  /** 受信画像に C2PA マニフェストが埋め込まれていたか。 */
  present: boolean;
  /** 署名・内容束縛が有効か（present=false のとき null）。 */
  verified: boolean | null;
  /** 署名者（signature issuer / claim_generator）。無ければ null。 */
  signer: string | null;
  /** 検証で観測した validation_status のコード（改変/信頼など）。 */
  validationCodes: string[];
}

const DISABLED: ExternalC2paResult = { present: false, verified: null, signer: null, validationCodes: [] };

/**
 * validation_status のコード群から「内容束縛・署名が有効か」を判定する純関数。
 *
 * 外部の未知の署名者（カメラ等）は Ledra の信頼リストに無いのが常態なので、
 * `*.untrusted`（信頼リスト未登録）は致命としない。dataHash 不一致・署名無効・失効など、
 * **内容が改変された/署名が壊れた**ことを示すコードのみを致命（verified=false）とみなす。
 * c2pa では validation_status が空/undefined のとき署名有効（→ verified=true）。
 */
export function interpretC2paValidation(codes: string[]): boolean {
  const FATAL = ["mismatch", "invalid", "revoked", "expired", "missing", "malformed"];
  return !codes.some((c) => FATAL.some((f) => c.toLowerCase().includes(f)));
}

type ReaderJson = {
  active_manifest?: string;
  manifests?: Record<string, { claim_generator?: string; signature_info?: { issuer?: string } }>;
  validation_status?: Array<{ code?: string }>;
};

/**
 * 受信画像の原バイトに埋め込まれた外部 C2PA マニフェストを検証する。
 * マニフェストが無ければ present=false。読取不能/エラーは fail-open（present=false）。
 * // ponytail: 原バイトのローカル読取（ネットワーク無し・通常 ms）。巨大画像で遅い場合の
 * //   打ち切りは未実装＝上限は「1画像1回の同期読取」。必要なら providers の withTimeout で包む。
 */
export async function verifyExternalC2pa(buffer: Buffer, mime: string): Promise<ExternalC2paResult> {
  try {
    const mod = (await import("@contentauth/c2pa-node")) as {
      Reader?: { fromAsset?: (a: { buffer: Buffer; mimeType: string }) => Promise<{ json: () => ReaderJson } | null> };
    };
    const Reader = mod.Reader;
    if (!Reader?.fromAsset) return DISABLED;

    const reader = await Reader.fromAsset({ buffer, mimeType: mime });
    if (!reader) return DISABLED; // マニフェスト無し

    const json = reader.json();
    const codes = (json.validation_status ?? []).map((s) => s.code ?? "").filter(Boolean);
    const active = json.active_manifest && json.manifests ? json.manifests[json.active_manifest] : undefined;
    const signer = active?.signature_info?.issuer || active?.claim_generator || null;

    return { present: true, verified: interpretC2paValidation(codes), signer, validationCodes: codes };
  } catch (err) {
    console.warn("[c2paVerify] external manifest read failed (fail-open)", err instanceof Error ? err.message : err);
    return DISABLED;
  }
}
