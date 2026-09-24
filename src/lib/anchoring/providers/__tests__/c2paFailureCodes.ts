/**
 * C2PA マニフェストの検証結果から**失敗コードだけ**を集める。
 *
 * dev 証明書用ゲート（`c2paSignValidate.test.ts`）と本番証明書用ゲート
 * （`c2paSignValidateProduction.test.ts`）の両方が使う。両者は許容コードの
 * 集合が違うだけで、**集め方は同じでなければならない**。
 *
 * 以前は2ファイルに同じ 18 行が複製されていた（PR #1115 の `/code-review` 指摘）。
 * 下の「失敗バケットだけを見る」という判断は微妙で、片方だけ直すと
 * **本番証明書のスイートが古い規則で読み続けて黙って通る**。だから1箇所に置く。
 */

/**
 * c2pa 0.6 は旧来の `validation_status` 配列（failures / warnings）と、
 * 構造化された `validation_results` オブジェクトの両方を出す。後者は
 * `success` / `informational` の下に**成功コード**（`assertion.dataHash.match` 等）も
 * 持つので、まるごと走査してはいけない —— 通っているマニフェストが
 * 失敗しているように見える。`failure` バケットだけを見る。
 */
export function collectFailureCodes(json: Record<string, unknown> | null): Set<string> {
  const acc = new Set<string>();
  const status = (json?.validation_status ?? []) as Array<{ code?: string }>;
  for (const e of status) if (e?.code) acc.add(e.code);
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach(walk);
    } else if (node && typeof node === "object") {
      const obj = node as Record<string, unknown>;
      if (Array.isArray(obj.failure)) {
        for (const e of obj.failure as Array<{ code?: string }>) if (e?.code) acc.add(e.code);
      }
      for (const v of Object.values(obj)) walk(v);
    }
  };
  walk(json?.validation_results);
  return acc;
}
