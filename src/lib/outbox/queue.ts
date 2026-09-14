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
    blockedAt: null,
  };
  const ok = await withStore("readwrite", (store) => store.add(item));
  if (ok == null) return null;
  return item;
}

/** 現在のキュー件数を返す。0 件 / SSR / DB 失敗時は 0 を返す (UI は壊さない)。 */
export async function countOutbox(): Promise<number> {
  // blocked は drain の対象外なので「同期待ち」には数えない。
  // 数に入れるとバッジが「N 件 同期待ち」のまま減らず、同期を押しても
  // 「同期待ちはありません」と出て食い違う。
  const r = await withStore<OutboxItem[]>("readonly", (store) => store.getAll());
  return (r ?? []).filter((it) => !it.blockedAt).length;
}

/** 恒久的に送れないと判定され、利用者の対応待ちになっているアイテム数。 */
export async function countBlockedOutbox(): Promise<number> {
  const r = await withStore<OutboxItem[]>("readonly", (store) => store.getAll());
  return (r ?? []).filter((it) => it.blockedAt).length;
}

/**
 * Outbox 全件 + 添付 Blob を削除する。
 *
 * 主な用途はログアウト / ユーザ切替時のクロステナント情報リーク防止。
 * 同一ブラウザで A → ログアウト → B が入り直したとき、A の未送信ジョブが
 * B のセッション資格情報で flush され他テナントへ漏れるのを防ぐ。
 *
 * 例外は飲み込み、SSR / IndexedDB 不可環境では何もしない (UI は壊さない)。
 */
export async function clearOutbox(): Promise<void> {
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    const stores: string[] = [STORE];
    if (db.objectStoreNames.contains(BLOB_STORE)) stores.push(BLOB_STORE);
    const tx = db.transaction(stores, "readwrite");
    for (const name of stores) tx.objectStore(name).clear();
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      resolve();
    };
    tx.onabort = () => {
      db.close();
      resolve();
    };
  });
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

/**
 * リクエスト内容が原因で恒久的に失敗したアイテムに印を付ける。
 * 以後 drain の対象から外れるので、永久リトライで後続を巻き込まなくなる。
 * 削除はしない（利用者が UI で内容を確認してから取り消せるようにするため）。
 */
export async function markOutboxBlocked(id: string, error: string): Promise<void> {
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
        blockedAt: Date.now(),
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

/**
 * そのステータスで再送しても結果が変わらないか。
 *
 * リクエスト内容が原因のもの (400 系の大半) は恒久的な失敗として扱う。
 * 一方 401/403 は再ログインや権限付与で回復しうるし、408/429/5xx は
 * 時間をおけば通るので、従来どおり再送対象のままにする。
 */
export function isPermanentClientError(status: number): boolean {
  // 404 は入れない: 先行アイテム (証明書の作成) がまだ同期されていない段階で
  // 後続 (発行・写真アップロード) が走ると 404 になり得るが、これは順番の問題で
  // 次回の drain では通る。恒久扱いにすると後続が永久に発行されなくなる。
  return status === 400 || status === 405 || status === 410 || status === 413 || status === 415 || status === 422;
}

export interface DrainResult {
  attempted: number;
  succeeded: number;
  failed: number;
  /** 恒久的な失敗として drain 対象から外したアイテム数 */
  blocked: number;
  errors: { id: string; error: string }[];
}

export interface DrainDeps {
  doFetch: typeof fetch;
  remove: (id: string) => Promise<void>;
  markAttempt: (id: string, error: string | null) => Promise<void>;
  /** 恒久的に送れないアイテムに印を付ける (以後 drain 対象外) */
  markBlocked: (id: string, error: string) => Promise<void>;
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
  const result: DrainResult = { attempted: 0, succeeded: 0, failed: 0, blocked: 0, errors: [] };
  for (const item of items) {
    if (!deps.isOnline()) break;
    // 恒久的な失敗と判定済みのアイテムは、送っても同じ結果にしかならないので試行しない。
    if (item.blockedAt) continue;
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
        const error = `HTTP ${res.status}: ${text.slice(0, 200)}`;
        if (isPermanentClientError(res.status)) {
          // 例: 必須項目が増えた後に、それを持たない古いアイテムが残っているケース。
          // 何度送っても 400 のままなので、印を付けて drain 対象から外す。
          await deps.markBlocked(item.id, error);
          result.blocked += 1;
        } else {
          await deps.markAttempt(item.id, error);
          result.failed += 1;
        }
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
 * 並行 drainOutbox を直列化するための in-flight ロック。
 *
 * 同一タブ内で OfflineBanner / PendingOfflineCerts / online イベントハンドラが
 * 同時に drainOutbox() を呼んだ場合、各々が同じ item に POST してしまうと
 * 冪等性キーがあっても "新規 → 重複 → 重複" の追加 round-trip と
 * markAttempt の race (attempts カウンタが片方に上書きされる) が起きうる。
 * 既に実行中なら同じ Promise を返す方が呼び出し側にとっても結果が一致する。
 */
let inFlightDrain: Promise<DrainResult> | null = null;

/**
 * キュー内のすべてのアイテムを順に試行する (実 IDB + fetch 版)。
 *
 * - 成功 (2xx): item を削除
 * - 失敗 (4xx/5xx/ネットワーク): attempts++ + lastError 更新 (削除しない)
 * - 409 Conflict は冪等性違反 → 既に処理済とみなして削除 (二重登録防止)
 *
 * ループ中に navigator.onLine が false になった場合は中断して残りは次回に回す。
 * 既に他の呼び出しが進行中であれば、その Promise を共有して二重 drain を避ける。
 */
export async function drainOutbox(opts?: { abortOnOffline?: boolean }): Promise<DrainResult> {
  if (inFlightDrain) return inFlightDrain;
  const abortOnOffline = opts?.abortOnOffline ?? true;
  inFlightDrain = (async () => {
    try {
      const items = await listOutbox();
      return await drainItems(items, {
        doFetch: fetch.bind(globalThis),
        remove: removeOutboxItem,
        markAttempt: markOutboxAttempt,
        markBlocked: markOutboxBlocked,
        isOnline: () =>
          abortOnOffline ? (typeof navigator === "undefined" ? true : navigator.onLine !== false) : true,
        resolveBlob: async (ref) => {
          const row = await getOutboxBlob(ref);
          if (!row) return null;
          return { blob: row.blob, fileName: row.fileName, mimeType: row.mimeType };
        },
      });
    } finally {
      inFlightDrain = null;
    }
  })();
  return inFlightDrain;
}
