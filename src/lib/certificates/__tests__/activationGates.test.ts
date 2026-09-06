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
import ts from "typescript";
import { walkSource } from "../../__tests__/sourceScan";
import {
  parse,
  collect,
  calls,
  calleeName,
  unwrapAwait,
  negated,
  alwaysExits,
  statementLists,
  declarationOf,
  hasExitingGuard,
  hasEnclosingGuard,
  isPropertyOf,
} from "../../__tests__/astScan";

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

/** その節点の中で「発行」が起きているか。`status: "active"` の書き込みか、発行フックの発火。 */
function issuesCertificate(node: ts.Node): boolean {
  if (calls(node, "triggerCertificateIssued")) return true;
  return collect(node, ts.isPropertyAssignment).some(
    (prop) =>
      ts.isIdentifier(prop.name) &&
      prop.name.text === "status" &&
      ts.isStringLiteral(prop.initializer) &&
      prop.initializer.text === "active",
  );
}

/**
 * Gate の判定が**発行を左右している**か。**構文木で見る。**
 *
 * 段階的に3回甘かった（いずれも Codex の指摘）。
 *   `<var>.ready` がどこかにある      → `logger.info(certGate.ready)` の後に無条件発行
 *   `if (!v.ready)` の存在だけ         → `if (!v.ready) audit(); activate();`（return が外）
 *   `if (v.ready) {` の存在だけ        → `if (v.ready) { log(); } activate();`（分岐が発行を包まない）
 *
 * 正しい形は2つ。**弾く側は必ず抜けること、通す側は発行を包んでいること**まで見る。
 */
function consultsCertGate(node: ts.Node): boolean {
  return statementLists(node).some((stmts) =>
    stmts.some((stmt, i) => {
      const decl = declarationOf(stmt);
      if (!decl || calleeName(unwrapAwait(decl.init)) !== "evaluateCertificateActivationGate") return false;
      const v = decl.name;
      const rest = stmts.slice(i + 1);
      const rejects = hasExitingGuard(rest, (cond) => {
        const inner = negated(cond);
        return inner !== null && isPropertyOf(inner, v, "ready");
      });
      const encloses = hasEnclosingGuard(
        rest,
        (cond) => isPropertyOf(cond, v, "ready"),
        (body) => issuesCertificate(body),
      );
      return rejects || encloses;
    }),
  );
}

/**
 * 走行距離が**発行の条件になっている**か。**構文木で見る。**
 *
 * 呼び出しの存在だけ → 結果を捨てても合格。`if` の中にあるだけ →
 * `if (mileage(x) !== null) log(); activate();` で合格（Codex の指摘）。
 * 実際の2つの形はどちらも「null と比べて、弾くか、発行を包むか」である。
 *   `if (certificateMileageKm(x) === null) return err;`
 *   `if (eligible && certificateMileageKm(x) !== null) { ...発行... }`
 */
function comparesMileageToNull(cond: ts.Expression): boolean {
  return collect(cond, ts.isBinaryExpression).some((b) => {
    const op = b.operatorToken.kind;
    const isNullCmp =
      (op === ts.SyntaxKind.EqualsEqualsEqualsToken || op === ts.SyntaxKind.ExclamationEqualsEqualsToken) &&
      (b.right.kind === ts.SyntaxKind.NullKeyword || b.left.kind === ts.SyntaxKind.NullKeyword);
    return isNullCmp && calls(b, "certificateMileageKm");
  });
}

function gatesOnMileage(node: ts.Node): boolean {
  return collect(node, ts.isIfStatement).some(
    (s) => comparesMileageToNull(s.expression) && (alwaysExits(s.thenStatement) || issuesCertificate(s.thenStatement)),
  );
}

describe("証明書を active にする経路", () => {
  const offenders: string[] = [];
  const gated: string[] = [];
  const ungatedByCertGate: string[] = [];

  for (const file of walkSource(ROOT)) {
    const src = readFileSync(file, "utf8");
    if (!isIssuancePath(file, src)) continue;
    const rel = file.slice(ROOT.length + 1);
    // 構文木で見る。コメントも import 行も最初から視界に入らない
    // （certificateRecordAuto.ts は冒頭コメントで両方の名前に触れている）。
    const tree = parse(src, file);
    (gatesOnMileage(tree) ? gated : offenders).push(rel);
    // IMP-028 (ADR-0005): draft→active の発行経路は evaluateCertificateActivationGate()
    // を必ず通す（写真必須・懸念未解決なし・部品整合性 等の単一評価器）。
    // 呼ぶだけでは足りない。**判定を読んでいる**ことまで見る（MISTAKE_LEDGER M-033・型 G）。
    if (!consultsCertGate(tree)) ungatedByCertGate.push(rel);
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
  const gate = (src: string) => consultsCertGate(parse(src));
  const mileage = (src: string) => gatesOnMileage(parse(src));
  const CALL = "const g = await evaluateCertificateActivationGate(admin, ctx);";

  it("判定を読むだけでは「通している」と見なさない", () => {
    expect(gate(CALL)).toBe(false);
    expect(gate(`${CALL}\nlogger.info(g.ready);\nactivate();`)).toBe(false);
  });

  it("弾く側は必ず抜けることまで要求する", () => {
    expect(gate(`${CALL}\nif (!g.ready) return err;`)).toBe(true);
    // return が if の外（Codex の指摘）。
    expect(gate(`${CALL}\nif (!g.ready) audit();\nreturn ok;`)).toBe(false);
  });

  it("通す側は発行を包んでいることまで要求する", () => {
    expect(gate(`${CALL}\nif (g.ready) { await admin.from("certificates").update({ status: "active" }); }`)).toBe(true);
    expect(gate(`${CALL}\nif (g.ready) { triggerCertificateIssued(x); }`)).toBe(true);
    // 分岐はあるが発行を包んでいない（Codex の指摘）。
    expect(gate(`${CALL}\nif (g.ready) { logger.info("ready"); }\nactivate({ status: "active" });`)).toBe(false);
  });

  it("向きが逆の分岐は通さない", () => {
    expect(gate(`${CALL}\nif (g.ready) return err;`)).toBe(false);
  });

  it("走行距離は null 比較で、弾くか発行を包むことまで要求する", () => {
    expect(mileage("certificateMileageKm(cert.maintenance_json);\nactivate();")).toBe(false);
    expect(mileage("if (certificateMileageKm(cert.maintenance_json) === null) return err;")).toBe(true);
    expect(
      mileage('if (eligible && certificateMileageKm(row.maintenance_json) !== null) { update({ status: "active" }); }'),
    ).toBe(true);
    // 条件にはあるが発行を左右しない（Codex の指摘）。
    expect(
      mileage('if (certificateMileageKm(row.maintenance_json) !== null) log();\nupdate({ status: "active" });'),
    ).toBe(false);
  });

  it("コメントの中身は最初から見ない（構文木にコメントは無い）", () => {
    expect(gate("// evaluateCertificateActivationGate() が ready なら active へ\nactivate();")).toBe(false);
    expect(mileage('import { certificateMileageKm } from "@/lib/maintenance/mileage";')).toBe(false);
  });
});
