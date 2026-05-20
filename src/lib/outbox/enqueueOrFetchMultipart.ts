/**
 * multipart/form-data 専用の enqueueOrFetch。
 *
 * オンライン: 通常通り fetch する
 * オフライン: File を IndexedDB の blobs ストアに保存し、enqueueOutbox にメタを積む。
 *              再接続時に drainOutbox が FormData を再構築して送信する。
 *
 * 注意: File オブジェクトは IDB に Blob として保存される。fileName と mimeType は
 * 別フィールドとして保管し、送信時に再構築する。
 */

import { enqueueOutbox, putOutboxBlob } from "./queue";
import type { OfflineCapableResult } from "./enqueueOrFetch";
import type { OutboxKind, OutboxMultipartFile } from "./types";

interface Options {
  url: string;
  /** form 文字列フィールド */
  fields?: Record<string, string>;
  /** form ファイルフィールド (複数可) */
  files: { fieldName: string; file: File }[];
  label: string;
  kind: OutboxKind;
  isOnline?: () => boolean;
  /** POST 以外 (PUT 等) で multipart を送る場合に指定 */
  method?: "POST" | "PUT" | "PATCH";
}

export async function enqueueOrFetchMultipart(opts: Options): Promise<OfflineCapableResult> {
  const isOnline = opts.isOnline ?? (() => (typeof navigator === "undefined" ? true : navigator.onLine !== false));
  const method = opts.method ?? "POST";

  if (isOnline()) {
    try {
      const form = new FormData();
      for (const [k, v] of Object.entries(opts.fields ?? {})) form.append(k, v);
      for (const f of opts.files) form.append(f.fieldName, f.file);
      const res = await fetch(opts.url, {
        method,
        body: form,
        credentials: "include",
      });
      return { ok: res.ok, status: res.status, queued: false, response: res };
    } catch (e) {
      // 送信中断 → outbox にフォールバック
      const queued = await enqueueMultipart(opts, method);
      return {
        ok: false,
        status: 0,
        queued: true,
        outboxId: queued?.id,
        networkError: e instanceof Error ? e.message : String(e),
      };
    }
  }

  // オフライン直 enqueue
  const queued = await enqueueMultipart(opts, method);
  return { ok: true, status: 202, queued: true, outboxId: queued?.id };
}

async function enqueueMultipart(opts: Options, method: "POST" | "PUT" | "PATCH"): Promise<{ id: string } | null> {
  const multipartFiles: OutboxMultipartFile[] = [];
  for (const f of opts.files) {
    const ref = await putOutboxBlob(f.file, f.file.name, f.file.type || "application/octet-stream");
    if (!ref) {
      // 保存失敗時はここまでに保存した blob refs もきれいに掃除したいが、
      // 例外パスなのでベストエフォート。次回 drain では「blob 不明」で markAttempt される。
      return null;
    }
    multipartFiles.push({
      name: f.fieldName,
      blobRef: ref,
      fileName: f.file.name,
      mimeType: f.file.type || "application/octet-stream",
    });
  }

  return enqueueOutbox({
    url: opts.url,
    method,
    bodyJson: null,
    label: opts.label,
    kind: opts.kind,
    multipart: {
      fields: Object.entries(opts.fields ?? {}).map(([name, value]) => ({ name, value })),
      files: multipartFiles,
    },
  });
}
