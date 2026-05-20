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
/** v1: items only / v2: + blobs store (multipart 添付ファイル用) */
const DB_VERSION = 2;
const STORE = "items";
const BLOB_STORE = "blobs";

function isAvailable(): boolean {
  return typeof globalThis !== "undefined" && typeof globalThis.indexedDB !== "undefined";
}

interface OutboxBlobRow {
  id: string;
  blob: Blob;
  fileName: string;
  mimeType: string;
  createdAt: number;
}

async function openDb(): Promise<IDBDatabase | null> {
  if (!isAvailable()) return null;
  return new Promise((resolve, reject) => {
    const req = globalThis.indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (event) => {
      const db = req.result;
      const oldVersion = event.oldVersion;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("byCreatedAt", "createdAt");
      }
      // v2: blobs ストアを追加 (v1 → v2 マイグレーション)
      if (oldVersion < 2 && !db.objectStoreNames.contains(BLOB_STORE)) {
        db.createObjectStore(BLOB_STORE, { keyPath: "id" });
      }
    };
    req.onerror = () => reject(req.error ?? new Error("indexedDB open failed"));
    req.onsuccess = () => resolve(req.result);
  });
}

/** Blob を outbox_blobs に保存し、ref ID を返す。 */
export async function putOutboxBlob(blob: Blob, fileName: string, mimeType: string): Promise<string | null> {
  const db = await openDb();
  if (!db) return null;
  const id = generateId();
  const row: OutboxBlobRow = { id, blob, fileName, mimeType, createdAt: Date.now() };
  return new Promise<string | null>((resolve, reject) => {
    const tx = db.transaction(BLOB_STORE, "readwrite");
    tx.objectStore(BLOB_STORE).add(row);
    tx.oncomplete = () => {
      db.close();
      resolve(id);
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error ?? new Error("blob put failed"));
    };
  });
}

/** ref ID から Blob を取り出す。 */
async function getOutboxBlob(refId: string): Promise<OutboxBlobRow | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise<OutboxBlobRow | null>((resolve) => {
    const tx = db.transaction(BLOB_STORE, "readonly");
    const req = tx.objectStore(BLOB_STORE).get(refId);
    req.onsuccess = () => resolve((req.result as OutboxBlobRow | undefined) ?? null);
    req.onerror = () => resolve(null);
    tx.oncomplete = () => db.close();
  });
}

/** 1 件削除 (item と紐付く blob refs も一緒に GC)。 */
async function removeOutboxBlobs(refIds: string[]): Promise<void> {
  if (refIds.length === 0) return;
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    const tx = db.transaction(BLOB_STORE, "readwrite");
    const store = tx.objectStore(BLOB_STORE);
    for (const ref of refIds) store.delete(ref);
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
    multipart: input.multipart,
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

/** 1 件削除 (フラッシュ成功時 or 手動キャンセル時)。multipart の blob refs も併せて GC する。 */
export async function removeOutboxItem(id: string): Promise<void> {
  // item 取得 → blob refs 列挙 → blob 削除 → item 削除 の順 (GC 漏れ防止)
  const db = await openDb();
  if (!db) return;
  let blobRefs: string[] = [];
  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(id);
    req.onsuccess = () => {
      const cur = req.result as OutboxItem | undefined;
      if (cur?.multipart) {
        blobRefs = cur.multipart.files.map((f) => f.blobRef);
      }
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
  await removeOutboxBlobs(blobRefs);
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
  /** multipart item の Blob ref を解決する。テスト時はモック注入 */
  resolveBlob?: (refId: string) => Promise<{ blob: Blob; fileName: string; mimeType: string } | null>;
}

/**
 * multipart item を再構築して fetch に渡せる FormData にする。
 * blob ref が見つからない (= IDB から消えていた) 場合は呼び出し側でエラー扱い。
 */
async function buildFormData(item: OutboxItem, resolveBlob: NonNullable<DrainDeps["resolveBlob"]>): Promise<FormData> {
  const form = new FormData();
  const mp = item.multipart;
  if (!mp) return form;
  for (const f of mp.fields) {
    form.append(f.name, f.value);
  }
  for (const file of mp.files) {
    const blob = await resolveBlob(file.blobRef);
    if (!blob) throw new Error(`multipart blob missing: ${file.blobRef}`);
    form.append(file.name, new File([blob.blob], file.fileName, { type: file.mimeType }));
  }
  return form;
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
      let body: BodyInit | undefined;
      let headers: Record<string, string>;
      if (item.multipart && deps.resolveBlob) {
        body = await buildFormData(item, deps.resolveBlob);
        // multipart の Content-Type は fetch がブラウザで自動付与 (boundary 含む)
        headers = { ...(item.headers ?? {}) };
      } else if (item.bodyJson) {
        body = item.bodyJson;
        headers = { "Content-Type": "application/json", ...(item.headers ?? {}) };
      } else {
        body = undefined;
        headers = { ...(item.headers ?? {}) };
      }

      const res = await deps.doFetch(item.url, {
        method: item.method,
        headers,
        body,
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
    resolveBlob: async (ref) => {
      const row = await getOutboxBlob(ref);
      if (!row) return null;
      return { blob: row.blob, fileName: row.fileName, mimeType: row.mimeType };
    },
  });
}
