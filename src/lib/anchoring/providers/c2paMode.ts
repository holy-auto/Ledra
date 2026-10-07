/**
 * `C2PA_MODE` の**唯一の正規化源**。
 *
 * ## なぜ `c2pa.ts` から分けてあるか（/code-review 指摘・2026-10-07）
 *
 * この4行を使いたいだけの呼び出し側（`photo-tampering` の集計、`photoTamperingAuto`、
 * `polygon-backfill`）が `c2pa.ts` を import すると、`c2pa.ts` が静的に読む
 * `@/lib/net/tls13Fetch` まで連れてくる。あちらは**モジュール評価時に undici の
 * `Agent` を作る**ので、署名を一度もしない経路のコールドスタートで接続プールが立ち、
 * さらに `tls13Fetch` の `ponytail:` が言うとおり **Edge ランタイムに移せなくなる**。
 *
 * 正規化は env を読むだけで何にも依存しない。だから葉に置く。
 * `c2pa.ts` は後方互換のためここから re-export している。
 */

export type C2paMode = "disabled" | "dev-signed" | "production";

/**
 * **呼び出し側は生の `process.env.C2PA_MODE` を読まずにこれを使う。**
 * `Production` のような綴り違いを `"disabled"` に落とすので、「署名もしないが本番ゲートも
 * 発火しない」という黙って未署名の状態を作らない（#1209 の `/code-review` 指摘 #5）。
 *
 * この規則を守れているかは `c2paModeSingleSource.test.ts` が走査して見張る。
 */
export function getMode(): C2paMode {
  const raw = process.env.C2PA_MODE;
  if (raw === "dev-signed" || raw === "production") return raw;
  return "disabled";
}
