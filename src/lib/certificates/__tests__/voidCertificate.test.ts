/**
 * 証明書の無効化が `voidCertificate()` の1本に寄っていることを固定する。
 *
 * 2026-09-05 に一本化するまで、「取得 → void 済み短絡 → status 更新 → 監査記録」を
 * 5経路がそれぞれ再実装していて、**実装がすでに食い違っていた**
 * （`updated_at` を書かない経路、証明書監査ログに残らない経路があった）。
 *
 * 検査は2本立て。
 *   1. ヘルパー自身の挙動（テナント絞り込み・短絡・meta 保持）
 *   2. `status: "void"` を証明書へ書く経路が、ヘルパー以外に増えていないこと
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { voidCertificate } from "../voidCertificate";

vi.mock("@/lib/audit/certificateLog", () => ({ logCertificateAction: vi.fn(async () => {}) }));

const REPO = resolve(__dirname, "../../../..");

/** `.eq()` を鎖でつなぐ Supabase もどき。最後の呼び出しが結果を返す。 */
function fakeDb(row: Record<string, unknown> | null, updateErr: unknown = null) {
  const calls: { table: string; op: string; filters: [string, unknown][]; patch?: unknown }[] = [];
  const chain = (rec: (typeof calls)[number], result: unknown) => {
    const self: Record<string, unknown> = {
      eq: (k: string, v: unknown) => {
        rec.filters.push([k, v]);
        return self;
      },
      limit: () => self,
      maybeSingle: async () => result,
      then: (r: (v: unknown) => unknown) => Promise.resolve(result).then(r),
    };
    return self;
  };
  return {
    calls,
    from(table: string) {
      return {
        select: () => {
          const rec = { table, op: "select", filters: [] as [string, unknown][] };
          calls.push(rec);
          return chain(rec, { data: row, error: row ? null : new Error("not found") });
        },
        update: (patch: unknown) => {
          const rec = { table, op: "update", filters: [] as [string, unknown][], patch };
          calls.push(rec);
          return chain(rec, { error: updateErr });
        },
      };
    },
  };
}

const ACTIVE = { id: "c1", public_id: "PUB1", vehicle_id: "v1", status: "active", meta: { keep: 1 } };

describe("voidCertificate", () => {
  it("テナントで必ず絞る（他テナントの証明書に触れない）", async () => {
    const db = fakeDb(ACTIVE);
    await voidCertificate(db, { tenantId: "t1", selector: { publicId: "PUB1" } });
    for (const c of db.calls) {
      expect(c.filters).toContainEqual(["tenant_id", "t1"]);
    }
  });

  it("void 済みなら短絡して更新しない", async () => {
    const db = fakeDb({ ...ACTIVE, status: "void" });
    const r = await voidCertificate(db, { tenantId: "t1", selector: { publicId: "PUB1" } });
    expect(r).toMatchObject({ ok: true, alreadyVoid: true });
    expect(db.calls.some((c) => c.op === "update")).toBe(false);
  });

  it("見つからなければ not_found", async () => {
    const r = await voidCertificate(fakeDb(null), { tenantId: "t1", selector: { publicId: "X" } });
    expect(r).toEqual({ ok: false, kind: "not_found" });
  });

  // ここだけ `updated_at` を書いていない経路があった（モバイル）。一本化の要点。
  it("status と updated_at を必ず書く", async () => {
    const db = fakeDb(ACTIVE);
    await voidCertificate(db, { tenantId: "t1", selector: { publicId: "PUB1" } });
    const patch = db.calls.find((c) => c.op === "update")!.patch as Record<string, unknown>;
    expect(patch.status).toBe("void");
    expect(typeof patch.updated_at).toBe("string");
  });

  it("理由を渡すと meta.void_reason に残し、既存 meta を潰さない", async () => {
    const db = fakeDb(ACTIVE);
    await voidCertificate(db, { tenantId: "t1", selector: { publicId: "PUB1" }, reason: "誤発行" });
    const patch = db.calls.find((c) => c.op === "update")!.patch as Record<string, unknown>;
    expect(patch.meta).toEqual({ keep: 1, void_reason: "誤発行" });
  });

  it("理由を渡さなければ meta に触れない", async () => {
    const db = fakeDb(ACTIVE);
    await voidCertificate(db, { tenantId: "t1", selector: { publicId: "PUB1" } });
    const patch = db.calls.find((c) => c.op === "update")!.patch as Record<string, unknown>;
    expect(patch).not.toHaveProperty("meta");
  });

  // 短絡を先に置くと、モバイルが void 済みを無効化したとき 200 が返り、
  // 呼び出し側が UPDATE の裏付けが無いまま `void_reason` 付きの監査イベントを書く。
  it("requireActive のとき void 済みは短絡せず拒否する（監査に偽の記録を残さない）", async () => {
    const db = fakeDb({ ...ACTIVE, status: "void" });
    const r = await voidCertificate(db, {
      tenantId: "t1",
      selector: { certificateId: "c1" },
      requireActive: true,
    });
    expect(r).toEqual({ ok: false, kind: "not_active", currentStatus: "void" });
    expect(db.calls.some((c) => c.op === "update")).toBe(false);
  });

  it("requireActive のとき draft は拒否する（モバイルの挙動）", async () => {
    const db = fakeDb({ ...ACTIVE, status: "draft" });
    const r = await voidCertificate(db, {
      tenantId: "t1",
      selector: { certificateId: "c1" },
      requireActive: true,
    });
    expect(r).toEqual({ ok: false, kind: "not_active", currentStatus: "draft" });
  });

  it("requireActive を付けなければ draft も無効化できる（Web の挙動）", async () => {
    const db = fakeDb({ ...ACTIVE, status: "draft" });
    const r = await voidCertificate(db, { tenantId: "t1", selector: { certificateId: "c1" } });
    expect(r).toMatchObject({ ok: true, alreadyVoid: false });
  });

  it("車両で追加に絞れる（車両詳細の Server Action の挙動）", async () => {
    const db = fakeDb(ACTIVE);
    await voidCertificate(db, {
      tenantId: "t1",
      selector: { certificateId: "c1", vehicleId: "v1" },
    });
    expect(db.calls[0].filters).toContainEqual(["vehicle_id", "v1"]);
  });

  it("更新に失敗したら update_failed を返す", async () => {
    const boom = new Error("boom");
    const r = await voidCertificate(fakeDb(ACTIVE, boom), {
      tenantId: "t1",
      selector: { publicId: "PUB1" },
    });
    expect(r).toEqual({ ok: false, kind: "update_failed", error: boom });
  });
});

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

describe("無効化の書き込み経路が増えていないこと", () => {
  /**
   * 一本化した4経路。ここが `voidCertificate` を呼ばなくなったら（＝自前の実装に
   * 戻したら）落とす。**import が消えることを見る**ので、書き換えれば必ず気づく。
   */
  const UNIFIED = [
    "src/app/api/certificates/void/route.ts",
    "src/app/api/admin/certificates/void/route.ts",
    "src/app/api/mobile/certificates/[id]/void/route.ts",
    "src/app/admin/vehicles/[id]/page.tsx",
  ];

  it.each(UNIFIED)("%s は voidCertificate を呼ぶ", (f) => {
    const src = readFileSync(join(REPO, f), "utf8");
    expect(src, `${f} が一本化から外れている`).toMatch(/certificates\/voidCertificate/);
  });

  /**
   * `voidCertificate` → `logCertificateAction` が `vehicle_histories` に1行入れる。
   * 呼び出し側が自分でも入れると、タイムラインと監査が二重になる。
   * 一本化のとき車両詳細の Server Action で実際にやった（Codex レビュー指摘）。
   */
  it("呼び出し側が自前で vehicle_histories に insert しない", () => {
    for (const f of UNIFIED) {
      const src = readFileSync(join(REPO, f), "utf8");
      expect(
        /from\(\s*["'`]vehicle_histories["'`]\s*\)[\s\S]{0,200}?\.insert\(/.test(src),
        `${f} が自前で vehicle_histories に insert している（logCertificateAction と二重になる）`,
      ).toBe(false);
    }
  });

  it("一本化した API 3経路は自前で certificates を update しない", () => {
    for (const f of UNIFIED.filter((f) => f.startsWith("src/app/api/"))) {
      const src = readFileSync(join(REPO, f), "utf8");
      expect(src.includes(".update("), `${f} に自前の update が戻っている`).toBe(false);
    }
  });

  /**
   * `status: "void"` をリテラルで書いてよいのは一本化した実装だけ。
   *
   * `src/app/api/admin/certificates/status/route.ts` は **状態遷移エンドポイント**で
   * `draft→active` / `void→active` も扱い、WebAuthn 操作署名ゲートと遷移表を持つ。
   * 無効化ヘルパーへ寄せるとヘルパーが**その経路だけが要る引数**（操作署名・遷移元・
   * 発行者の本人性）を抱えることになるので、意図して別実装のまま残している
   * （DECISION_LOG 2026-09-05）。書いているのは `status: newStatus` の変数なので
   * このリテラル検査には現れない。
   */
  it('status: "void" のリテラルは一本化した実装にしか無い', () => {
    const files = walk(join(REPO, "src")).filter((f) => !f.includes("__tests__"));
    // 検査が空振りしていないことを確かめる（型 A）。この検査は一度、
    // 正規表現がどの許可ファイルにも当たらないまま緑で通っていた。
    expect(files.length).toBeGreaterThan(500);

    const writers = files
      .filter((f) => /status:\s*["']void["']/.test(readFileSync(f, "utf8")))
      .map((f) => f.slice(REPO.length + 1));

    expect(writers, "検査対象が0件。パターンが実際の書き方に追いつけていない").not.toEqual([]);
    expect(
      writers,
      "\n  証明書の無効化は voidCertificate() に一本化されている。" +
        "\n  新しい経路を足すときはそれを呼ぶこと（テナント絞り込み・updated_at・監査ログが揃う）。",
    ).toEqual(["src/lib/certificates/voidCertificate.ts"]);
  });
});
