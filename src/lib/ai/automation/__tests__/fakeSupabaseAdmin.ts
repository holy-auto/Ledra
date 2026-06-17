/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * auto-action フック結合テスト用の最小 fake Supabase admin。
 *
 * `createServiceRoleAdmin()` が返すクライアントを差し替える用途。実 DB / 実 AI を使わずに
 * 「フックが正しい行を読み、正しい形で書き、ガードを守るか」を検証する。
 *
 * 対応している呼び出し:
 *   from(t).select().eq()...maybeSingle()/single()           → 1 行
 *   from(t).select().eq()....(await)                          → 配列 (thenable)
 *   from(t).update(payload).eq()...(await)                    → store.updates に記録 + 行へ反映
 *   from(t).insert(payload)[.select().single()] / .then()     → store.inserts に記録
 *   storage.from(b).createSignedUrl(p) / download(p) / remove / upload
 *
 * これはテスト専用ヘルパ (*.test.ts ではないので suite として実行されない)。
 */

export interface FakeStore {
  /** テーブル名 -> 行配列。eq フィルタで完全一致したものを返す。 */
  tables: Record<string, Array<Record<string, any>>>;
  /** storage path -> 中身 (download の arrayBuffer に使う)。 */
  files?: Record<string, string>;
  /** 記録された update / insert (アサーション用)。 */
  updates: Array<{ table: string; payload: Record<string, any>; filters: Record<string, any> }>;
  inserts: Array<{ table: string; payload: any }>;
}

export function emptyStore(tables: FakeStore["tables"] = {}, files: FakeStore["files"] = {}): FakeStore {
  return { tables, files, updates: [], inserts: [] };
}

export function makeFakeAdmin(store: FakeStore): any {
  function builderFor(table: string) {
    const filters: Record<string, any> = {};
    let op: "select" | "update" | "insert" = "select";
    let updatePayload: Record<string, any> = {};

    const rows = () => store.tables[table] ?? [];
    const matched = () => rows().filter((r) => Object.entries(filters).every(([k, v]) => r[k] === v));

    const applyUpdate = () => {
      store.updates.push({ table, payload: updatePayload, filters: { ...filters } });
      for (const r of matched()) Object.assign(r, updatePayload);
    };

    const builder: any = {
      select: () => builder,
      eq: (c: string, v: any) => {
        filters[c] = v;
        return builder;
      },
      neq: () => builder,
      not: () => builder,
      in: () => builder,
      gte: () => builder,
      lte: () => builder,
      order: () => builder,
      limit: () => builder,
      maybeSingle: async () => ({ data: matched()[0] ?? null, error: null }),
      single: async () => {
        const row = matched()[0] ?? null;
        return { data: row, error: row ? null : { message: "no row" } };
      },
      update: (payload: Record<string, any>) => {
        op = "update";
        updatePayload = payload;
        return builder;
      },
      insert: (payload: any) => {
        op = "insert";
        store.inserts.push({ table, payload });
        return builder;
      },
      // await したときの解決値 (op に応じて分岐)。
      then: (resolve: (v: any) => void) => {
        if (op === "update") {
          applyUpdate();
          resolve({ data: null, error: null });
        } else if (op === "insert") {
          resolve({ data: null, error: null });
        } else {
          resolve({ data: matched(), error: null });
        }
      },
    };
    return builder;
  }

  return {
    from: (table: string) => builderFor(table),
    storage: {
      from: () => ({
        createSignedUrl: async (path: string) => ({ data: { signedUrl: `signed://${path}` }, error: null }),
        download: async (path: string) => {
          const content = store.files?.[path];
          if (content == null) return { data: null, error: { message: "not found" } };
          return { data: { arrayBuffer: async () => Buffer.from(content) }, error: null };
        },
        remove: async () => ({ data: null, error: null }),
        upload: async () => ({ data: null, error: null }),
      }),
    },
  };
}
