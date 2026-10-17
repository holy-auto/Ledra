/**
 * 証明書 PDF の冒頭文（DECLARATION）が、刻印の無い証明書で
 * 「ブロックチェーンに刻印された」と書かないことを確認する。
 *
 * これが壊れると、刻印されていない証明書に事実と違う文が載ったまま顧客の手元に残る。
 * 本番の実測（2026-10-17）では証明書 70 件に対し刻印は 11 件で、その 11 件はすべて
 * 撮影用のデモテナントのものだった（実テナントは1件も刻印されていない）。
 */
import { describe, it, expect } from "vitest";
import { buildServiceStatement } from "../pdfCertificate";

const ANCHOR_CLAIM = "ブロックチェーンに刻印";
const SERVICE_TYPES = [null, undefined, "ppf", "maintenance", "body_repair", "accessory", "unknown_kind"];

describe("buildServiceStatement", () => {
  it("刻印が無いときは、どの施工種別でも刻印の文言を出さない", () => {
    for (const t of SERVICE_TYPES) {
      const s = buildServiceStatement(t, false);
      expect(s, `service_type=${String(t)}`).not.toContain(ANCHOR_CLAIM);
      expect(s).toContain("施工時に記録された写真と作業内容に基づいて");
      expect(s.startsWith("本証明書は、下記車両に対して")).toBe(true);
      expect(s.endsWith("証明するものです。")).toBe(true);
    }
  });

  it("刻印があるときは刻印の文言を出す", () => {
    for (const t of SERVICE_TYPES) {
      expect(buildServiceStatement(t, true), `service_type=${String(t)}`).toContain(ANCHOR_CLAIM);
    }
  });

  it("施工種別ごとに主語が変わる（刻印の有無では変わらない）", () => {
    expect(buildServiceStatement("ppf", false)).toContain("ペイントプロテクションフィルム (PPF) の施工が完了した事実");
    expect(buildServiceStatement("maintenance", false)).toContain("整備作業が実施された事実");
    expect(buildServiceStatement("body_repair", false)).toContain("鈑金塗装作業が実施された事実");
    expect(buildServiceStatement("accessory", false)).toContain("用品取付作業が実施された事実");
    // 未知の種別・未設定は汎用の主語に落ちる
    expect(buildServiceStatement("unknown_kind", false)).toContain("施工作業が完了した事実");
    expect(buildServiceStatement(null, true)).toContain("施工作業が完了した事実");
  });
});
