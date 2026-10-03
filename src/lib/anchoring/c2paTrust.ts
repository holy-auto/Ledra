import { C2PA_TRUST_LIST_PEM, C2PA_TSA_TRUST_LIST_PEM } from "./c2paTrustList.generated";

/**
 * C2PA の検証（外部マニフェストの確認と、取り込んだ原本の ingredient 検証）に公式 Trust List（CA と TSA）を使う設定。
 * 2026-10-02 Conformance Administrator の助言。TSA を信頼しないと証明書の有効期限を撮影時ではなく今で判定するので、
 * 証明書が期限切れになった端末の本物の写真まで `signingCredential.expired`（Invalid）になる。
 *
 * ponytail: c2pa-rs 0.90.22 は署名者と TSA を1つの信頼ストアで見るので、2つのリストを連結して渡す
 * （TSA のルートが署名者の信頼にも数えられうる。分けるには c2pa-rs 側の対応が要る。crJSON ハーネスはパッチで分けている）。
 * リストの更新は `node scripts/update-c2pa-trust-list.mjs`。
 */
export const C2PA_TRUST_SETTINGS = {
  trust: { trustAnchors: `${C2PA_TRUST_LIST_PEM}${C2PA_TSA_TRUST_LIST_PEM}` },
};
