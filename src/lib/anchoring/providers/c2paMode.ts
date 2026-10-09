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
 * `Production` のような綴り違いは `"disabled"` に落ちる。
 *
 * **これは安全性の保証ではない。** `/code-review` の指摘（2026-10-08）どおり、
 * 今の呼び出し側は正規化してもしなくても同じに振る舞う ——
 * `uploadHandler.ts` / `processUploadedPhoto.ts` の `=== "production"` は
 * どちらでも false、`authenticityGrade.ts:52` の `!== "dev-signed"` はどちらでも true。
 * つまり `C2PA_MODE=Production` は**どちらの道でも「黙って未署名」になる**。
 * ここに書いていた「黙って未署名の状態を作らない」は**言い過ぎだった**ので直した。
 *
 * では何のためにあるか —— **同じ正規化規則を2箇所に書かないため**である。
 * 下流の比較が1つ変わった日に、片方だけ直して分岐するのを防ぐ。
 * 守れているかは `c2paModeSingleSource.test.ts` が走査して見張る。
 */
export function getMode(): C2paMode {
  const raw = process.env.C2PA_MODE;
  if (raw === "dev-signed" || raw === "production") return raw;
  return "disabled";
}
