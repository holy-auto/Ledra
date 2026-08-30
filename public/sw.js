/**
 * Ledra Service Worker
 * - Caches app shell for offline resilience
 * - Network-first for API calls, cache-first for static assets
 * - Stale-while-revalidate for admin pages + selected GET APIs (offline read)
 * - Background Sync: drains the IndexedDB outbox queue when the OS
 *   detects network availability, even if the tab is closed
 */

const CACHE_NAME = "ledra-v2";
const HTML_CACHE = "ledra-html-v1";
const API_CACHE = "ledra-api-v1";
/** Cache の TTL (ms)。これより古い stale はオフライン時のみ使う */
const STALE_AT_MS = 7 * 24 * 60 * 60 * 1000; // 7 日

/**
 * オフライン読み取り対象の admin API GET エンドポイント。
 * 同期写真などのバイナリ・PDF・Plaintext は対象外 (キャッシュ容量考慮)。
 *
 * 注: 同一ブラウザを複数ユーザで使う運用は想定外。テナント切替や
 * ログアウト時には clearOfflineReadCache() で全消去すること。
 */
const CACHEABLE_API_PATTERNS = [
  /^\/api\/admin\/certificates(\?|$)/,
  /^\/api\/admin\/reservations(\?|$)/,
  /^\/api\/admin\/customers(\?|$|\/[^/]+\/messages)/,
  /^\/api\/admin\/jobs\/[^/]+\/photos$/,
  /^\/api\/admin\/service-packages(\?|$)/,
];

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
          .filter((key) => key !== CACHE_NAME && key !== HTML_CACHE && key !== API_CACHE)
          .map((key) => caches.delete(key)),
      ),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // 同一オリジンのみ対象 (CORS / 外部 CDN は触らない)
  if (url.origin !== self.location.origin) return;

  // Static assets (fonts, images): cache-first
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

  // Selected admin API: stale-while-revalidate (offline read)
  if (url.pathname.startsWith("/api/") && isCacheableApi(url.pathname)) {
    event.respondWith(staleWhileRevalidate(request, API_CACHE));
    return;
  }

  // その他の API は network-only (mutation / リアルタイム性が要るため)
  if (url.pathname.startsWith("/api/")) return;

  // Admin pages (HTML): stale-while-revalidate
  // 注意: ユーザ別データを含むため、ログアウトや別ユーザでログインする時は
  // clearOfflineReadCache() で消すこと (clients から postMessage で呼べる)
  if (url.pathname.startsWith("/admin") && request.headers.get("accept")?.includes("text/html")) {
    event.respondWith(staleWhileRevalidate(request, HTML_CACHE));
    return;
  }

  // それ以外はブラウザ任せ (JS/CSS は Next.js のハッシュ URL に頼る)
});

function isCacheableApi(pathname) {
  for (const re of CACHEABLE_API_PATTERNS) {
    if (re.test(pathname)) return true;
  }
  return false;
}

/**
 * Stale-while-revalidate: 即座に cache を返しつつ、バックグラウンドで再取得して更新する。
 * Cache hit がオンライン時は古いまま 1 回返してから裏で更新。オフライン時のみ stale を表示。
 *
 * 戻り Response にはユーザの状態判定用のヘッダを足す:
 *   - X-From-Cache: "1" (キャッシュから返した)
 *   - X-Cache-Age-Ms: 数値 (キャッシュ作成からの経過 ms)
 */
async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const now = Date.now();

  const fetchAndCache = fetch(request)
    .then((response) => {
      if (response.ok) {
        // タイムスタンプ用のラッパー Response を作成して保存
        const wrapped = wrapWithMeta(response.clone(), now);
        cache.put(request, wrapped).catch(() => {});
      }
      return response;
    })
    .catch(() => null);

  if (cached) {
    // オンラインなら再取得を待たずに stale を返す (UX 優先)。オフラインなら結果は同じ
    const cachedAt = Number(cached.headers.get("X-Cached-At-Ms")) || 0;
    const ageMs = now - cachedAt;
    const headers = new Headers(cached.headers);
    headers.set("X-From-Cache", "1");
    headers.set("X-Cache-Age-Ms", String(ageMs));
    return new Response(cached.body, { status: cached.status, statusText: cached.statusText, headers });
  }

  // Cache 不在: network を待つしかない (offline なら自然に失敗 = ブラウザのエラー)
  const fresh = await fetchAndCache;
  return fresh || new Response(JSON.stringify({ error: "offline_no_cache" }), {
    status: 503,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Response を加工してメタヘッダ X-Cached-At-Ms を付与する。
 * cache.put 前に呼ぶ。body は stream なので Response constructor で詰め直す。
 */
async function wrapWithMeta(response, cachedAtMs) {
  const headers = new Headers(response.headers);
  headers.set("X-Cached-At-Ms", String(cachedAtMs));
  // STALE_AT_MS より古いキャッシュは offline 時のみ使う前提 (現状は強制削除しない)
  void STALE_AT_MS;
  const body = await response.arrayBuffer();
  return new Response(body, { status: response.status, statusText: response.statusText, headers });
}

/** clients からのメッセージで cache 全消去 (ログアウト時に呼ぶ)。 */
async function clearOfflineReadCaches() {
  await Promise.all([caches.delete(HTML_CACHE), caches.delete(API_CACHE)]);
}

// ─── Background Sync: タブが閉じていても OS-level で drain を試行する ───
//
// 対応ブラウザ (Chromium 系) では navigator.serviceWorker.ready.sync.register()
// 経由でタグを登録できる。OS が「再接続を検知したら」自動的に sync イベントを
// 起こす。最大数日後まで遅延される可能性があるため、最終手段としての位置付け。
self.addEventListener("sync", (event) => {
  if (event.tag !== SYNC_TAG) return;
  event.waitUntil(drainOutbox());
});

// ページからの postMessage を処理:
//   - "drain-outbox": Outbox を SW スコープで drain (Background Sync の手動 trigger)
//   - "clear-offline-cache": ログアウト等で HTML / API キャッシュを全消去
self.addEventListener("message", (event) => {
  // 同一オリジンのクライアントからの postMessage のみ受け付ける。
  // (origin が空のケース = 同一オリジンの内部メッセージは許容)
  if (event.origin && event.origin !== self.location.origin) return;
  const type = event.data && event.data.type;
  if (type === "drain-outbox") {
    event.waitUntil(drainOutbox());
  } else if (type === "clear-offline-cache") {
    event.waitUntil(clearOfflineReadCaches());
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

/**
 * そのステータスで再送しても結果が変わらないか。
 *
 * src/lib/outbox/queue.ts の isPermanentClientError と同じ規則。SW は別コピーなので、
 * 片方だけ直すとタブを閉じている間だけ永久リトライが復活する。必ず両方そろえること。
 * 404 は入れない (先行アイテムが未同期のときの一時的な 404 があるため)。
 */
function isPermanentClientError(status) {
  return (
    status === 400 || status === 405 || status === 410 || status === 413 || status === 415 || status === 422
  );
}

/** 恒久的に送れないアイテムに印を付ける。削除はしない (UI で利用者が確認して取り消す)。 */
function markBlocked(db, id, error) {
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
        blockedAt: Date.now(),
      });
      store.put(updated);
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
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
    // 恒久的な失敗と判定済みのものは送っても同じ結果にしかならない
    if (item.blockedAt) continue;
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
        const error = "HTTP " + res.status + ": " + text.slice(0, 200);
        if (isPermanentClientError(res.status)) {
          await markBlocked(db, item.id, error);
        } else {
          await markAttempt(db, item.id, error);
        }
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
