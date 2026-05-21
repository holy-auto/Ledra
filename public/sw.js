/**
 * Ledra Service Worker
 * - Caches app shell for offline resilience
 * - Network-first for API calls, cache-first for static assets
 * - Background Sync: drains the IndexedDB outbox queue when the OS
 *   detects network availability, even if the tab is closed
 */

const CACHE_NAME = "ledra-v2";

// ─── IndexedDB Outbox 定義 (src/lib/outbox/queue.ts と一致させること) ────────────
const OUTBOX_DB_NAME = "ledra-outbox";
const OUTBOX_DB_VERSION = 2;
const OUTBOX_ITEMS_STORE = "items";
const OUTBOX_BLOBS_STORE = "blobs";
const SYNC_TAG = "drain-outbox";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key)),
      ),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET and API requests
  if (request.method !== "GET" || url.pathname.startsWith("/api/")) return;

  // Static assets (fonts, images): cache-first
  // JS/CSS are excluded — Next.js uses content-hashed URLs and handles its own caching
  if (url.pathname.match(/\.(png|jpg|jpeg|svg|webp|avif|woff2?|ico|gif)$/)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            if (response.ok) {
              const clone = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
            }
            return response;
          }),
      ),
    );
    return;
  }

  // All other requests (HTML, JS, CSS, API): network-only
});

// ─── Background Sync: タブが閉じていても OS-level で drain を試行する ───
//
// 対応ブラウザ (Chromium 系) では navigator.serviceWorker.ready.sync.register()
// 経由でタグを登録できる。OS が「再接続を検知したら」自動的に sync イベントを
// 起こす。最大数日後まで遅延される可能性があるため、最終手段としての位置付け。
self.addEventListener("sync", (event) => {
  if (event.tag !== SYNC_TAG) return;
  event.waitUntil(drainOutbox());
});

// 開発・テスト用: ページから postMessage で手動トリガできる ('drain-outbox' を投げる)
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "drain-outbox") {
    event.waitUntil(drainOutbox());
  }
});

// ── IndexedDB アクセスヘルパ (queue.ts の最小サブセット) ────────────────────

function openOutboxDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(OUTBOX_DB_NAME, OUTBOX_DB_VERSION);
    // SW から先に open した場合に schema が無いことは原則ない (ページ側で先に作る)
    // が、安全のためここでも作成する
    req.onupgradeneeded = (e) => {
      const db = req.result;
      const oldVersion = e.oldVersion;
      if (!db.objectStoreNames.contains(OUTBOX_ITEMS_STORE)) {
        const store = db.createObjectStore(OUTBOX_ITEMS_STORE, { keyPath: "id" });
        store.createIndex("byCreatedAt", "createdAt");
      }
      if (oldVersion < 2 && !db.objectStoreNames.contains(OUTBOX_BLOBS_STORE)) {
        db.createObjectStore(OUTBOX_BLOBS_STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function listItems(db) {
  return new Promise((resolve) => {
    const tx = db.transaction(OUTBOX_ITEMS_STORE, "readonly");
    const req = tx.objectStore(OUTBOX_ITEMS_STORE).index("byCreatedAt").getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => resolve([]);
  });
}

function getItem(db, id) {
  return new Promise((resolve) => {
    const tx = db.transaction(OUTBOX_ITEMS_STORE, "readonly");
    const req = tx.objectStore(OUTBOX_ITEMS_STORE).get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => resolve(null);
  });
}

function getBlob(db, refId) {
  return new Promise((resolve) => {
    const tx = db.transaction(OUTBOX_BLOBS_STORE, "readonly");
    const req = tx.objectStore(OUTBOX_BLOBS_STORE).get(refId);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => resolve(null);
  });
}

function deleteItem(db, id, blobRefs) {
  return new Promise((resolve) => {
    const tx = db.transaction([OUTBOX_ITEMS_STORE, OUTBOX_BLOBS_STORE], "readwrite");
    tx.objectStore(OUTBOX_ITEMS_STORE).delete(id);
    const blobs = tx.objectStore(OUTBOX_BLOBS_STORE);
    for (const ref of blobRefs || []) blobs.delete(ref);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
    tx.onabort = () => resolve();
  });
}

function markAttempt(db, id, error) {
  return new Promise((resolve) => {
    const tx = db.transaction(OUTBOX_ITEMS_STORE, "readwrite");
    const store = tx.objectStore(OUTBOX_ITEMS_STORE);
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const cur = getReq.result;
      if (!cur) return;
      const updated = Object.assign({}, cur, {
        attempts: (cur.attempts || 0) + 1,
        lastAttemptAt: Date.now(),
        lastError: error,
      });
      store.put(updated);
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

async function buildFormData(item, db) {
  const form = new FormData();
  const mp = item.multipart;
  if (!mp) return form;
  for (const f of mp.fields || []) form.append(f.name, f.value);
  for (const file of mp.files || []) {
    const row = await getBlob(db, file.blobRef);
    if (!row) throw new Error("multipart blob missing: " + file.blobRef);
    form.append(file.name, new File([row.blob], file.fileName, { type: file.mimeType }));
  }
  return form;
}

async function drainOutbox() {
  let db;
  try {
    db = await openOutboxDb();
  } catch (e) {
    // DB が無い (ページ未訪問) ケースは何もしない
    return;
  }

  const items = await listItems(db);
  for (const item of items) {
    // OS は SW を起こしてくれているが念のため (タイミング次第で false に振れる)
    if (typeof navigator !== "undefined" && navigator.onLine === false) break;
    try {
      let body;
      let headers = Object.assign({}, item.headers || {});
      if (item.multipart) {
        body = await buildFormData(item, db);
        // Content-Type は fetch 側が自動 (boundary を含む)
      } else if (item.bodyJson) {
        body = item.bodyJson;
        headers["Content-Type"] = "application/json";
      } else {
        body = undefined;
      }

      const res = await fetch(item.url, {
        method: item.method,
        headers,
        body,
        credentials: "include",
      });

      if (res.ok || res.status === 409) {
        const blobRefs = item.multipart ? (item.multipart.files || []).map((f) => f.blobRef) : [];
        await deleteItem(db, item.id, blobRefs);
      } else {
        const text = await res.text().catch(() => "");
        await markAttempt(db, item.id, "HTTP " + res.status + ": " + text.slice(0, 200));
      }
    } catch (e) {
      await markAttempt(db, item.id, e && e.message ? e.message : String(e));
    }
  }

  // ページが開いていれば「同期完了」を通知する (UI 側で OfflineBanner を更新する用)
  try {
    const clients = await self.clients.matchAll({ includeUncontrolled: true });
    for (const client of clients) {
      client.postMessage({ type: "outbox-drained" });
    }
  } catch (e) {
    // ignore
  }
}
