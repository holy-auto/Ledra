import { X509Certificate } from "node:crypto";
import { C2PA_TRUST_LIST_PEM, C2PA_TSA_TRUST_LIST_PEM } from "./c2paTrustList.generated";

/**
 * C2PA の検証（外部マニフェストの確認と、取り込んだ原本の ingredient 検証）に公式 Trust List（CA と TSA）を使う設定。
 * 2026-10-02 Conformance Administrator の助言。TSA を信頼しないと証明書の有効期限を撮影時ではなく今で判定するので、
 * 証明書が期限切れになった端末の本物の写真まで `signingCredential.expired`（Invalid）になる。
 *
 * c2pa-node に生の設定（snake_case の JSON 文字列）で渡す。`Context` だと c2pa-utilities の既定値
 * （builder 設定など）まで混ざり、署名の構成が信頼以外でも変わる。
 *
 * ponytail: c2pa-rs 0.90.22 は署名者と TSA を1つの信頼ストアで見るので、2つのリストを合わせて渡す。
 * TSA リストにしか無い中間 CA 6件（各社の TSA 用）が署名者の信頼にも数えられうる。発行先は TSA 事業者だけなので
 * 実害は小さいと判断。分けるには c2pa-rs 側の対応が要る（crJSON ハーネスはパッチで分けている）。
 * リストの更新は `node scripts/update-c2pa-trust-list.mjs`。
 */
const blocks = (pem: string) => pem.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g) ?? [];

/** 両リストの証明書（TSA リストの多くは CA リストと同じルートなので、指紋で重複を除く）。 */
export const C2PA_TRUST_ANCHORS: string[] = (() => {
  const seen = new Set<string>();
  return [...blocks(C2PA_TRUST_LIST_PEM), ...blocks(C2PA_TSA_TRUST_LIST_PEM)].filter((pem) => {
    const fp = new X509Certificate(pem).fingerprint256;
    return seen.has(fp) ? false : (seen.add(fp), true);
  });
})();

/** `Reader.fromAsset(asset, settings)` / `Builder.withJson(json, settings)` に渡す設定。 */
export const C2PA_TRUST_SETTINGS = JSON.stringify({ trust: { trust_anchors: C2PA_TRUST_ANCHORS.join("\n") } });
