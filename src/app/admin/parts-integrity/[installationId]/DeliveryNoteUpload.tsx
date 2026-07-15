"use client";

/**
 * 納品書アップロード (parts.auto_reconcile_delivery_note の入口)。
 *
 * 画像を POST /api/parts/installations/[id]/delivery-note に送ると、サーバが
 * assets バケットへ保存し evidence (kind=delivery_note) を追記する。opt-in テナントでは
 * アップロード後に AI-OCR + 三方照合が自動実行され、不一致が「検知」に追記される。
 * (確定署名・アンカー・在庫計上には関与しない。)
 */
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

export default function DeliveryNoteUpload({ installationId }: { installationId: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setErr(null);
    setMsg(null);
    try {
      const fd = new FormData();
      fd.append("delivery_note", file);
      const res = await fetch(`/api/parts/installations/${installationId}/delivery-note`, {
        method: "POST",
        body: fd,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(json?.message ?? "アップロードに失敗しました。");
        return;
      }
      setMsg("納品書をアップロードしました。自動照合が有効なら、まもなく「検知」に結果が反映されます。");
      // 自動照合 (after()) は非同期のため、少し待ってから検知一覧を再取得する。
      setTimeout(() => router.refresh(), 2500);
    } catch {
      setErr("通信エラーが発生しました。");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-2">
      <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border-default bg-surface px-4 py-2 text-sm font-medium text-secondary hover:bg-surface-hover">
        {uploading ? (
          <>
            <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-secondary border-t-transparent" />
            アップロード中…
          </>
        ) : (
          <>📄 納品書をアップロード</>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          capture="environment"
          className="hidden"
          disabled={uploading}
          onChange={handleFile}
        />
      </label>
      <p className="text-xs text-secondary">
        アップロードすると assets に保存し、AI-OCR で明細化して装着内容・数量と三方照合します (自動照合はテナント設定で
        opt-in)。
      </p>
      {msg && <p className="text-xs text-success">{msg}</p>}
      {err && <p className="text-xs text-red-600">{err}</p>}
    </div>
  );
}
