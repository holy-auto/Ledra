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
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { walkSource, stripComments } from "../../__tests__/sourceScan";

const ROOT = join(process.cwd(), "src");

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

/**
 * Gate の**判定を読んでいる**か。呼ぶだけ・結果を捨てる形は「通している」と見なさない。
 *
 * 呼び出し側の形は2通りある。どちらも `.ready` を読む。
 *   `if (!certGate.ready) return ...`   — 弾く（API 3経路）
 *   `if (certGate.ready) { ...active化 }` — ready のときだけ発行（自動発行）
 */
function consultsCertGate(src: string): boolean {
  const m = /(?:const|let|var)\s+(\w+)\s*=\s*await\s+evaluateCertificateActivationGate\s*\(/.exec(src);
  if (!m) return false;
  return new RegExp(String.raw`\b${m[1]}\.ready\b`).test(src);
}

describe("証明書を active にする経路", () => {
  const offenders: string[] = [];
  const gated: string[] = [];
  const ungatedByCertGate: string[] = [];

  for (const file of walkSource(ROOT)) {
    // **コメントを落としてから照合する。** `src.includes(...)` を生ソースに当てていた頃は、
    // 「この経路は Gate を通る」と書いた説明コメントや import 行だけでも合格していた
    // （実際 certificateRecordAuto.ts は冒頭コメントで両方の名前に触れている）。
    const src = stripComments(readFileSync(file, "utf8"));
    if (!isIssuancePath(file, src)) continue;
    const rel = file.slice(ROOT.length + 1);
    // 名前の出現ではなく**呼び出しの形**を要求する。import しただけでは通さない。
    (/certificateMileageKm\s*\(/.test(src) ? gated : offenders).push(rel);
    // IMP-028 (ADR-0005): draft→active の発行経路は evaluateCertificateActivationGate()
    // を必ず通す（写真必須・懸念未解決なし・部品整合性 等の単一評価器）。
    // 呼ぶだけでは足りない。**判定を読んでいる**ことまで見る（MISTAKE_LEDGER M-033・型 G）。
    if (!consultsCertGate(src)) ungatedByCertGate.push(rel);
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

describe("検出器そのものの性質", () => {
  // 「呼んでいる」と「効いている」は別。述語を値で動かして確かめる（M-033・型 G）。
  it("判定を読まない書き方は「通している」と見なさない", () => {
    expect(consultsCertGate("const certGate = await evaluateCertificateActivationGate(admin, ctx);")).toBe(false);
    expect(
      consultsCertGate(
        "const certGate = await evaluateCertificateActivationGate(admin, ctx);\nif (!certGate.ready) return err;",
      ),
    ).toBe(true);
    // ready のときだけ発行する形（自動発行）も通す。
    expect(
      consultsCertGate("const g = await evaluateCertificateActivationGate(admin, ctx);\nif (g.ready) { activate(); }"),
    ).toBe(true);
  });

  it("コメントの言及と import だけでは通さない", () => {
    // 生ソースに `includes` を当てていた頃は、この2行だけで両方のゲートが合格していた。
    const mentionOnly = stripComments(
      "// evaluateCertificateActivationGate() が ready なら作成直後に active へ\n" +
        'import { certificateMileageKm } from "@/lib/maintenance/mileage";\n',
    );
    expect(consultsCertGate(mentionOnly)).toBe(false);
    expect(/certificateMileageKm\s*\(/.test(mentionOnly)).toBe(false);
    // 呼んでいれば通る。
    expect(/certificateMileageKm\s*\(/.test("if (certificateMileageKm(json) === null) return err;")).toBe(true);
  });
});
