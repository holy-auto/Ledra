/**
 * 証明書を `active` にする経路が、走行距離ゲートを必ず通ることを保証する。
 *
 * このゲートは「作成経路ごとではなく発行の瞬間に必須化する」という設計の要。
 * 前回は作成経路5本のうち2本を漏らし、今回は発行経路を「2本」と数えて
 * モバイルの1本を漏らした（レビューで発覚）。人が数える限り必ず漏れるので、
 * ソースを走査して数え直す。
 *
 * 新しい発行経路を足したときは、このテストが落ちる。
 * ゲートを入れるのが正しい対応で、除外リストに足すのは原則として誤り。
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(process.cwd(), "src");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === "__tests__" || name === "node_modules") continue;
      walk(p, out);
    } else if (name.endsWith(".ts") || name.endsWith(".tsx")) {
      out.push(p);
    }
  }
  return out;
}

/**
 * 証明書を発行 (active 化) しているソースを拾う。
 *
 * 2つの合図の**和**で数える。片方だけだと漏れる:
 *  - `triggerCertificateIssued(` を発火している = 発行として扱っている
 *    （ステータスの書き方は経路ごとに違う: `status: newStatus` / `certRow.status = ...`）
 *  - `certificates` に `status: "active"` を書き込んでいる
 *    （削除済みの `activateCertAction` は発行フックを発火せずにこれだけをしていた）
 */
function isIssuancePath(file: string, src: string): boolean {
  if (file.endsWith(join("lib", "certificates", "issueHooks.ts"))) return false; // 定義元
  if (/triggerCertificateIssued\(/.test(src)) return true;
  if (!/from\("certificates"\)/.test(src)) return false;
  // `status === "active"` のような比較は拾わない (オブジェクトリテラルのみ)。
  return /\.(update|insert)\(/.test(src) && /status:\s*"active"/.test(src);
}

describe("証明書を active にする経路", () => {
  const offenders: string[] = [];
  const gated: string[] = [];
  const ungatedByCertGate: string[] = [];

  for (const file of walk(ROOT)) {
    const src = readFileSync(file, "utf8");
    if (!isIssuancePath(file, src)) continue;
    const rel = file.slice(ROOT.length + 1);
    (src.includes("certificateMileageKm") ? gated : offenders).push(rel);
    // IMP-028 (ADR-0005): draft→active の発行経路は evaluateCertificateActivationGate()
    // を必ず通す（写真必須・懸念未解決なし・部品整合性 等の単一評価器）。
    if (!src.includes("evaluateCertificateActivationGate(")) ungatedByCertGate.push(rel);
  }

  it("すべて走行距離ゲート (certificateMileageKm) を通る", () => {
    expect(offenders).toEqual([]);
  });

  it("経路を1本以上検出できている（走査が空振りしていない）", () => {
    // 検出ロジックが壊れて 0 件になると、上のテストが常に緑になってしまう。
    expect(gated.length).toBeGreaterThanOrEqual(4);
  });

  it("すべて Certificate Gate (evaluateCertificateActivationGate) を通る", () => {
    expect(ungatedByCertGate).toEqual([]);
  });
});
