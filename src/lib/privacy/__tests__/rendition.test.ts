import { describe, it, expect } from "vitest";
import {
  MASKING_STRATEGIES,
  applyMask,
  createRendition,
  CERTIFICATE_PUBLIC_RULES,
  VEHICLE_PUBLIC_RULES,
  PASSPORT_PUBLIC_RULES,
  type MaskingRule,
} from "../rendition";
import { VEHICLE_TABLE_PII_COLUMNS, PASSPORT_TABLE_PII_COLUMNS } from "@/lib/vehicles/customerRelation";

describe("MASKING_STRATEGIES", () => {
  it("4 戦略が定義されている", () => {
    expect(MASKING_STRATEGIES).toEqual(["nullify", "redact", "truncate", "hash"]);
  });
});

describe("applyMask", () => {
  it("nullify → null", () => {
    expect(applyMask("hello", "nullify")).toBeNull();
  });

  it("redact → デフォルト '***'", () => {
    expect(applyMask("secret", "redact")).toBe("***");
  });

  it("redact → カスタム置換文字列", () => {
    expect(applyMask("secret", "redact", { redactedValue: "[REDACTED]" })).toBe("[REDACTED]");
  });

  it("truncate → 先頭 keepChars + '***'", () => {
    expect(applyMask("田中太郎", "truncate", { keepChars: 2 })).toBe("田中***");
  });

  it("truncate keepChars=0 → '***'", () => {
    expect(applyMask("hello", "truncate")).toBe("***");
  });

  it("truncate keepChars >= 文字列長 → 半分以下にクランプしてマスク（Codex レビュー指摘: 以前は無条件で全文字露出していた）", () => {
    // "hi" は長さ2、floor(2/2)=1文字までしか残さない。
    expect(applyMask("hi", "truncate", { keepChars: 5 })).toBe("h***");
  });

  it("truncate 短い機密値（PIN 等）でも常に半分以下しか残らない", () => {
    expect(applyMask("123", "truncate", { keepChars: 10 })).toBe("1***"); // floor(3/2)=1
  });

  it("truncate keepChars が負値 → 0 にクランプ（Codex レビュー指摘: 末尾からのオフセットで露出しない）", () => {
    // String.slice(0, -1) は末尾1文字以外を残してしまう。0 にクランプすれば全マスク。
    expect(applyMask("tanaka@example.com", "truncate", { keepChars: -1 })).toBe("***");
  });

  it("hash → 'sha256:' + 値の先頭8文字（呼び出し側が事前にハッシュ済みの値を渡す前提、MD5相当の32文字以上）", () => {
    const md5Like = "deadbeefcafe0123deadbeefcafe0123"; // 32文字の16進数
    expect(applyMask(md5Like, "hash")).toBe("sha256:deadbeef");
  });

  it("hash に生の値（16進数でない）を渡すと '***' にフォールバックする（Codex レビュー指摘: 生の値を sha256 と偽らない）", () => {
    // メールアドレス等の生の値を誤って渡した場合、先頭8文字を "sha256:" と
    // 偽って一部露出させてはならない。
    expect(applyMask("tanaka@example.com", "hash")).toBe("***");
  });

  it("hash に短い純粋数字（電話番号・クレジットカード番号等）を渡すと '***' にフォールバックする（/code-review 指摘: 0-9 は16進数字の部分集合のため誤判定しうる）", () => {
    expect(applyMask("09012345678", "hash")).toBe("***");
    expect(applyMask("4111111111111111", "hash")).toBe("***");
  });

  it("null 入力 → null（全戦略共通）", () => {
    for (const s of MASKING_STRATEGIES) {
      expect(applyMask(null, s)).toBeNull();
    }
  });

  it("undefined 入力 → null", () => {
    expect(applyMask(undefined, "nullify")).toBeNull();
  });

  it("数値入力 → truncate は文字列化してから切る", () => {
    // "12345" は長さ5、floor(5/2)=2文字までしか残さない。
    expect(applyMask(12345, "truncate", { keepChars: 3 })).toBe("12***");
  });
});

describe("createRendition", () => {
  const rules: readonly MaskingRule[] = [
    { field: "name", appliesBelow: "tenant_internal", strategy: "nullify" },
    { field: "email", appliesBelow: "partner_shared", strategy: "redact" },
  ];

  const original = { name: "田中", email: "tanaka@example.com", id: "abc" };

  it("owner_only → tenant_internal/partner_shared 要求のフィールドはマスクされる（自動昇格しない）", () => {
    // 旧仕様「owner_only は全フィールド可視」は VISIBILITY_ORDER の生比較を
    // 直接使っていた頃の名残で、canAccess() を owner_only 非ネスト化した際に
    // ここだけ追随できていなかった（Codex レビュー指摘、P1）。
    // owner_only 要求のルールが無いここでは、owner_only 閲覧者は本人向け
    // フィールド以外（tenant_internal/partner_shared 要求）は見えない。
    // 「本人自身のレコードなら見せたい」というケースは、この汎用機構では
    // 解決しない既知の限界——呼び出し側が isDataSubject と「このレコードが
    // 本人のものか」を個別に確認してから呼ぶ必要がある（DEFAULT_REQUIRED_
    // VISIBILITY の JSDoc 参照）。
    const r = createRendition(original, rules, "owner_only");
    expect(r.name).toBeNull();
    expect(r.email).toBe("***");
  });

  it("tenant_internal → name 可視、email 可視（partner_shared 未満ではない）", () => {
    const r = createRendition(original, rules, "tenant_internal");
    expect(r.name).toBe("田中");
    expect(r.email).toBe("tanaka@example.com");
  });

  it("partner_shared → name マスク、email 可視", () => {
    const r = createRendition(original, rules, "partner_shared");
    expect(r.name).toBeNull();
    expect(r.email).toBe("tanaka@example.com");
  });

  it("public → name マスク、email マスク", () => {
    const r = createRendition(original, rules, "public");
    expect(r.name).toBeNull();
    expect(r.email).toBe("***");
  });

  it("非破壊（元のオブジェクトは変更されない）", () => {
    const copy = { ...original };
    createRendition(original, rules, "public");
    expect(original).toEqual(copy);
  });

  it("ルールに無いフィールドはそのまま", () => {
    const r = createRendition(original, rules, "public");
    expect(r.id).toBe("abc");
  });
});

describe("定義済みルール", () => {
  it("CERTIFICATE_PUBLIC_RULES — customer_name, content_free_text, vehicle_info_json を nullify", () => {
    // vehicle_info_json（maker/model/plate を含む）が抜けていたバグの回帰防止
    // （Codex レビュー指摘: certificates_public ビュー自身のマスキングが元々不完全だった）。
    expect(CERTIFICATE_PUBLIC_RULES).toHaveLength(3);
    expect(CERTIFICATE_PUBLIC_RULES.map((r) => r.field).sort()).toEqual([
      "content_free_text",
      "customer_name",
      "vehicle_info_json",
    ]);
    for (const r of CERTIFICATE_PUBLIC_RULES) {
      expect(r.strategy).toBe("nullify");
      expect(r.appliesBelow).toBe("tenant_internal");
    }
  });

  it("VEHICLE_PUBLIC_RULES — VEHICLE_TABLE_PII_COLUMNS（単一定義源）と完全一致", () => {
    // 手書きの固定リストにすると、テーブル側でカラムが増減しても追随せず乖離する
    // （customer_name 等は既に削除済み・plate_display が抜けていたバグの回帰防止）。
    expect(VEHICLE_PUBLIC_RULES.map((r) => r.field).sort()).toEqual([...VEHICLE_TABLE_PII_COLUMNS].sort());
    for (const r of VEHICLE_PUBLIC_RULES) {
      expect(r.strategy).toBe("nullify");
    }
  });

  it("PASSPORT_PUBLIC_RULES — PASSPORT_TABLE_PII_COLUMNS（単一定義源）と完全一致", () => {
    // from_owner_name/from_owner_email（前所有者 PII）が抜けていたバグの回帰防止。
    expect(PASSPORT_PUBLIC_RULES.map((r) => r.field).sort()).toEqual([...PASSPORT_TABLE_PII_COLUMNS].sort());
    for (const r of PASSPORT_PUBLIC_RULES) {
      expect(r.appliesBelow).toBe("partner_shared");
      expect(r.strategy).toBe("nullify");
    }
  });

  it("定義済みルールは実行時に凍結されている（Codex レビュー指摘: readonly は型上の防御でしかない）", () => {
    // readonly MaskingRule[] は arr[0] = ... を防ぐが、arr[0].appliesBelow = ... という
    // プロパティ代入は型チェッカーを迂回すれば通ってしまう。Object.freeze で実行時に防ぐ。
    expect(() => {
      (CERTIFICATE_PUBLIC_RULES[0] as { appliesBelow: string }).appliesBelow = "public";
    }).toThrow();
    expect(() => {
      (VEHICLE_PUBLIC_RULES as MaskingRule[]).push({ field: "x", appliesBelow: "public", strategy: "nullify" });
    }).toThrow();
  });
});
