/**
 * 顧客ポータルの本人確定（監査 2026-10-17 Critical）。
 *
 * 以前は下4桁が一致すれば入力されたメール（攻撃者のもの）へコードを送り、メールが
 * 顧客と合わなくても customer_id 無しのセッションを作っていた。データ取得は
 * 「下4桁ハッシュだけで絞る」旧経路に落ち、同じ下4桁の他人の証明書・連絡先が読めた。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

type Row = Record<string, unknown>;
const db: Record<string, Row[]> = {};

// ponytail: このテストが使う PostgREST の形だけを再現する最小の偽 DB。
function from(table: string) {
  const preds: ((r: Row) => boolean)[] = [];
  let insertRow: Row | null = null;
  let single = false;
  const run = () => {
    if (insertRow) {
      (db[table] ??= []).push(insertRow);
      return { data: null, error: null };
    }
    const rows = (db[table] ?? []).filter((r) => preds.every((p) => p(r)));
    return { data: single ? (rows[0] ?? null) : rows, error: null };
  };
  const q = {
    select: () => q,
    eq: (c: string, v: unknown) => (preds.push((r) => r[c] === v), q),
    neq: (c: string, v: unknown) => (preds.push((r) => r[c] !== v), q),
    // PostgreSQL の ILIKE と同じく `_` / `%` をワイルドカード、`\` の後ろを文字そのものとして扱う
    ilike: (c: string, pattern: string) => {
      const re = pattern.replace(/\\(.)|([_%])|([^\\_%]+)/g, (_m, esc, wild, lit) =>
        esc !== undefined
          ? esc.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
          : wild
            ? wild === "_"
              ? "."
              : ".*"
            : lit.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
      );
      preds.push((r) => new RegExp(`^${re}$`, "i").test(String(r[c] ?? "")));
      return q;
    },
    in: (c: string, vs: unknown[]) => (preds.push((r) => vs.includes(r[c])), q),
    is: (c: string, v: unknown) => (preds.push((r) => (r[c] ?? null) === v), q),
    not: (c: string, _op: string, v: unknown) => (preds.push((r) => (r[c] ?? null) !== v), q),
    order: () => q,
    limit: () => q,
    maybeSingle: () => ((single = true), q),
    insert: (row: Row) => ((insertRow = row), q),
    then: (ok: (v: unknown) => unknown) => Promise.resolve(run()).then(ok),
  };
  return q;
}

vi.mock("@/lib/supabase/admin", () => ({ createServiceRoleAdmin: () => ({ from }) }));
vi.mock("@/lib/audit/certificateLog", () => ({ OUTWARD_VISIBLE_TYPES: [] }));

process.env.CUSTOMER_AUTH_PEPPER = "test-pepper";
const portal = await import("../customerPortalServer");

const T = "tenant-1";
const H = portal.phoneLast4Hash(T, "1234");

beforeEach(() => {
  for (const k of Object.keys(db)) delete db[k];
  // 同じ下4桁 1234 の顧客が2人（衝突は普通に起きる）
  db.customers = [
    { id: "victim", tenant_id: T, email: "Victim@example.com", name: "被害者", phone: "090-0000-1234" },
    { id: "other", tenant_id: T, email: "other@example.com", name: "別の客", phone: "080-1111-1234" },
  ];
  db.certificates = [
    { public_id: "p1", tenant_id: T, customer_id: "victim", customer_phone_last4_hash: H, status: "active" },
    { public_id: "p2", tenant_id: T, customer_id: "other", customer_phone_last4_hash: H, status: "active" },
  ];
});

describe("resolveUniqueCustomerId", () => {
  it("下4桁だけ合っていてメールが登録顧客と違えば確定しない（攻撃者のメール）", async () => {
    expect(await portal.resolveUniqueCustomerId(T, H, "attacker@evil.example")).toBeNull();
  });
  it("下4桁が衝突していても、メールで本人1人に確定する（大文字小文字は無視）", async () => {
    expect(await portal.resolveUniqueCustomerId(T, H, "victim@example.com")).toBe("victim");
    expect(await portal.resolveUniqueCustomerId(T, H, "other@example.com")).toBe("other");
  });
  it("同じ人の重複登録（同じメール・同じ下4桁）でも締め出さず、新しい証明書の行に確定する", async () => {
    db.customers.push({ id: "victim-dup", tenant_id: T, email: "victim@example.com", phone: "090-0000-1234" });
    db.certificates.push({
      public_id: "p3",
      tenant_id: T,
      customer_id: "victim-dup",
      customer_phone_last4_hash: H,
      status: "active",
    });
    expect(await portal.resolveUniqueCustomerId(T, H, "victim@example.com")).not.toBeNull();
  });
  it("メールの `_` はワイルドカードにならない（ta_o@ で taro@ を引かない）", async () => {
    expect(await portal.resolveUniqueCustomerId(T, H, "victi_@example.com")).toBeNull();
  });
  it("メールが合っても下4桁が違えば確定しない", async () => {
    expect(await portal.resolveUniqueCustomerId(T, portal.phoneLast4Hash(T, "9999"), "victim@example.com")).toBeNull();
  });
});

describe("createSession / validateSession", () => {
  it("本人を確定できなければセッションを作らない", async () => {
    expect(await portal.createSession(T, "attacker@evil.example", H)).toBeNull();
    expect(db.customer_sessions ?? []).toHaveLength(0);
  });
  it("確定できたセッションは customer_id 付きで、その顧客の証明書だけ見える", async () => {
    const sess = await portal.createSession(T, "victim@example.com", H);
    const v = await portal.validateSession(T, sess!.token);
    expect(v?.customer_id).toBe("victim");
    const certs = await portal.listCertificatesForCustomer(T, v!.customer_id);
    expect(certs.map((c) => c.public_id)).toEqual(["p1"]);
  });
  it("customer_id の無い旧セッションは無効（下4桁ハッシュだけで他人に届くため）", async () => {
    const token = "legacy-token";
    db.customer_sessions = [
      {
        tenant_id: T,
        session_hash: portal.sessionHash(token),
        email: "attacker@evil.example",
        phone_last4_hash: H,
        customer_id: null,
        expires_at: new Date(Date.now() + 86400_000).toISOString(),
        revoked_at: null,
      },
    ];
    expect(await portal.validateSession(T, token)).toBeNull();
  });
});
