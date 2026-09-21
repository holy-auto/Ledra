/**
 * ネイティブ依存（`sharp` / `@contentauth/c2pa-node`）をテストから読み込むための
 * 唯一の入口。**読み込めなければ落とす（fail-closed）。**
 *
 * ## なぜ要るか（DECISION_LOG 2026-09-21 / OPEN_QUESTIONS 2026-09-14 起票）
 *
 * C2PA の適合性ゲートは、実画像を署名してマニフェストを検証する本物の検査である。
 * しかし読み込み失敗を `ctx.skip()` で逃がしていたため、**依存が入らないだけで
 * 検査が丸ごと沈黙し、CI は緑のままだった。** 2026-09-14 に実際にそうなっていた
 * （`npm ci` が `@contentauth/c2pa-node` を入れず、4本ともスキップ）。
 *
 * `@contentauth/c2pa-node` は `optionalDependencies` にあり、lockfile に
 * `os` / `cpu` の制約は無い（`optional: true` だけ）。つまり「この環境では動かない」
 * ではなく「入らないことがある」であり、**入らなかったことは隠すべき事実ではない。**
 *
 * そこで、読み込めないことを skip ではなく失敗として出す。C2PA は Ledra の
 * 証明の中核なので、「検査できなかった」と「検査して通った」が同じ緑になる状態を残さない。
 *
 * ## 代償
 *
 * ネイティブ依存が入らない環境では、ローカルの `npm test` が落ちる。
 * これは意図した挙動である（起票時に代償として明示され、その上で fail-closed を選んだ）。
 * 落ちたときに何をすればよいかが分かるよう、元の例外を `cause` に残して
 * 原因（未インストール／別プラットフォームのバイナリ）を区別できるようにしてある。
 *
 * ponytail: 上限。ここが見るのは「読み込めたか」だけで、読み込めた実装が正しいかは見ない。
 * API 形状の退行やマニフェストの不正は、この関数の後ろで普通のテスト失敗になる
 * （ガードを読み込みだけに限定しているのはそのため）。
 */

/**
 * `load()` を実行し、失敗したら**何が読み込めなかったか**を添えて投げ直す。
 *
 * skip しないことがこの関数の存在理由である。フラグを立てて後段で `ctx.skip()` する形に
 * 戻すと、検査は「走らなかったのに緑」に戻る。
 *
 * @param load 動的 import を包んだクロージャ
 * @param what 読み込もうとしたものの名前（失敗メッセージに出る）
 */
export async function requireNative<T>(load: () => Promise<T>, what: string): Promise<T> {
  try {
    return await load();
  } catch (cause) {
    throw new Error(
      `${what} を読み込めませんでした。この検査は fail-closed です（skip しません）。\n` +
        `  未インストールなら: npm ci で入るか確認する（optionalDependencies なので黙って抜けることがある）。\n` +
        `  "invalid ELF header" などなら: 別プラットフォーム向けのバイナリが置かれている。\n` +
        `  理由は src/lib/anchoring/__tests__/nativeImaging.ts と DECISION_LOG 2026-09-21 を参照。`,
      { cause },
    );
  }
}
