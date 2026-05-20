/**
 * IndexedDB ベースのオフライン Outbox キュー実装。
 *
 * 設計:
 *  - DB 名: `ledra-outbox`、ObjectStore: `items` (keyPath="id")
 *  - 純粋なブラウザ API のみ (idb など外部 SDK 不要)
 *  - すべての関数は SSR 環境を考慮し、`indexedDB` 未定義時は safe にフォールバック
 *  - drainOutbox は順次 fetch を試行する。失敗時は attempts/lastError を更新し
 *    後続の再試行に委ねる。連続失敗時のバックオフは呼び出し側 (BackoffOnFailures
 *    フラグや指数バックオフ) に任せ、本ライブラリは最小限の責務に絞る。
 */

import type { EnqueueInput, OutboxItem } from "./types";

const DB_NAME = "ledra-outbox";
const DB_VERSION = 1;
const STORE = "items";

function isAvailable(): boolean {
  return typeof globalThis !== "undefined" && typeof globalThis.indexedDB !== "undefined";
}

async function openDb(): Promise<IDBDatabase | null> {
  if (!isAvailable()) return null;
  return new Promise((resolve, reject) => {
    const req = globalThis.indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("byCreatedAt", "createdAt");
      }
    };
    req.onerror = () => reject(req.error ?? new Error("indexedDB open failed"));
    req.onsuccess = () => resolve(req.result);
  });
}

function isIdbRequest(v: unknown): v is IDBRequest<unknown> {
  return typeof v === "object" && v !== null && "readyState" in (v as object);
}

async function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T> | Promise<T>,
): Promise<T | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise<T | null>((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const store = tx.objectStore(STORE);
    let result: T | null = null;
    Promise.resolve(fn(store))
      .then((r) => {
        if (isIdbRequest(r)) {
          (r as IDBRequest<T>).onsuccess = () => {
            result = (r as IDBRequest<T>).result;
          };
        } else {
          result = r as T;
        }
      })
      .catch(reject);
    tx.oncomplete = () => {
      db.close();
      resolve(result);
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error ?? new Error("indexedDB tx failed"));
    };
    tx.onabort = () => {
      db.close();
      reject(tx.error ?? new Error("indexedDB tx aborted"));
    };
  });
}

function generateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Fallback (very old browsers; we ship to evergreen so this rarely fires)
  return `outbox-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** 新規アイテムをキューに追加し、生成された OutboxItem を返す。 */
export async function enqueueOutbox(input: EnqueueInput): Promise<OutboxItem | null> {
  const item: OutboxItem = {
    id: generateId(),
    url: input.url,
    method: input.method,
    bodyJson: input.bodyJson ?? null,
    headers: input.headers ?? undefined,
    label: input.label,
    kind: input.kind,
    createdAt: Date.now(),
    attempts: 0,
    lastAttemptAt: null,
    lastError: null,
  };
  const ok = await withStore("readwrite", (store) => store.add(item));
  if (ok == null) return null;
  return item;
}

/** 現在のキュー件数を返す。0 件 / SSR / DB 失敗時は 0 を返す (UI は壊さない)。 */
export async function countOutbox(): Promise<number> {
  const r = await withStore<number>("readonly", (store) => store.count());
  return r ?? 0;
}

/** キュー全件を作成順に返す。 */
export async function listOutbox(): Promise<OutboxItem[]> {
  const db = await openDb();
  if (!db) return [];
  return new Promise<OutboxItem[]>((resolve) => {
    const tx = db.transaction(STORE, "readonly");
    const store = tx.objectStore(STORE);
    const req = store.index("byCreatedAt").getAll();
    req.onsuccess = () => {
      resolve((req.result as OutboxItem[]) ?? []);
    };
    req.onerror = () => resolve([]);
    tx.oncomplete = () => db.close();
  });
}

/** 1 件削除 (フラッシュ成功時 or 手動キャンセル時)。 */
export async function removeOutboxItem(id: string): Promise<void> {
  await withStore("readwrite", (store) => store.delete(id));
}

/** 試行結果を反映 (lastError=null なら成功扱いだがアイテム削除はしない)。 */
export async function markOutboxAttempt(id: string, error: string | null): Promise<void> {
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const cur = getReq.result as OutboxItem | undefined;
      if (!cur) return;
      const updated: OutboxItem = {
        ...cur,
        attempts: cur.attempts + 1,
        lastAttemptAt: Date.now(),
        lastError: error,
      };
      store.put(updated);
    };
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      resolve();
    };
  });
}

export interface DrainResult {
  attempted: number;
  succeeded: number;
  failed: number;
  errors: { id: string; error: string }[];
}

export interface DrainDeps {
  doFetch: typeof fetch;
  remove: (id: string) => Promise<void>;
  markAttempt: (id: string, error: string | null) => Promise<void>;
  /** 現在の online 状態を返す。false で中断 */
  isOnline: () => boolean;
}

/**
 * IDB に依存しないコアループ。引数で依存を受け取り、テスト容易性を保つ。
 *
 * - 成功 (2xx): remove を呼んで item を削除
 * - 409 Conflict: 既に処理済と見なして remove (二重登録防止)
 * - 失敗 (4xx/5xx/ネットワーク): markAttempt(id, error) を呼ぶ。削除しない
 * - ループ中 isOnline() が false になったら break
 */
export async function drainItems(items: OutboxItem[], deps: DrainDeps): Promise<DrainResult> {
  const result: DrainResult = { attempted: 0, succeeded: 0, failed: 0, errors: [] };
  for (const item of items) {
    if (!deps.isOnline()) break;
    result.attempted += 1;
    try {
      const res = await deps.doFetch(item.url, {
        method: item.method,
        headers: { ...(item.bodyJson ? { "Content-Type": "application/json" } : {}), ...(item.headers ?? {}) },
        body: item.bodyJson ?? undefined,
        credentials: "include",
      });
      if (res.ok || res.status === 409) {
        await deps.remove(item.id);
        result.succeeded += 1;
      } else {
        const text = await res.text().catch(() => "");
        await deps.markAttempt(item.id, `HTTP ${res.status}: ${text.slice(0, 200)}`);
        result.failed += 1;
        result.errors.push({ id: item.id, error: `HTTP ${res.status}` });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await deps.markAttempt(item.id, msg);
      result.failed += 1;
      result.errors.push({ id: item.id, error: msg });
    }
  }
  return result;
}

/**
 * キュー内のすべてのアイテムを順に試行する (実 IDB + fetch 版)。
 *
 * - 成功 (2xx): item を削除
 * - 失敗 (4xx/5xx/ネットワーク): attempts++ + lastError 更新 (削除しない)
 * - 409 Conflict は冪等性違反 → 既に処理済とみなして削除 (二重登録防止)
 *
 * ループ中に navigator.onLine が false になった場合は中断して残りは次回に回す。
 */
export async function drainOutbox(opts?: { abortOnOffline?: boolean }): Promise<DrainResult> {
  const abortOnOffline = opts?.abortOnOffline ?? true;
  const items = await listOutbox();
  return drainItems(items, {
    doFetch: fetch.bind(globalThis),
    remove: removeOutboxItem,
    markAttempt: markOutboxAttempt,
    isOnline: () => (abortOnOffline ? (typeof navigator === "undefined" ? true : navigator.onLine !== false) : true),
  });
}
