"use client";

import { useCallback, useRef, useState } from "react";
import Link from "next/link";

type AnchorVerifyResult = {
  sha256: string;
  onChainVerified: boolean;
  authenticity_grade: "unverified" | "basic" | "verified" | "premium" | null;
  polygon_tx_hash: string | null;
  polygon_network: "polygon" | "amoy" | null;
  explorer_url: string | null;
  c2pa_verified: boolean | null;
  c2pa_manifest: {
    signerMode: "dev-signed" | "production";
    actions: string[];
    binding: { certPublicId: string | null; vin: string | null; tsaTimestamp: string | null; nonceSealed: boolean };
  } | null;
  captured_at: string | null;
  device_model: string | null;
  certificate_public_id: string | null;
  certificate_status: string | null;
  image_created_at: string | null;
};

type Stage = "idle" | "hashing" | "verifying" | "done" | "error";

const SHA256_RE = /^[a-f0-9]{64}$/;

async function computeSha256(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function normalizeHash(input: string): string | null {
  const cleaned = input.trim().toLowerCase().replace(/^0x/, "");
  return SHA256_RE.test(cleaned) ? cleaned : null;
}

function gradeLabel(g: AnchorVerifyResult["authenticity_grade"]): { label: string; cls: string } {
  switch (g) {
    case "premium":
      return { label: "プレミアム", cls: "bg-emerald-100 text-emerald-800 border-emerald-300" };
    case "verified":
      return { label: "検証済み", cls: "bg-sky-100 text-sky-800 border-sky-300" };
    case "basic":
      return { label: "基本", cls: "bg-amber-100 text-amber-800 border-amber-300" };
    case "unverified":
      return { label: "未検証", cls: "bg-surface-hover text-secondary border-border-default" };
    default:
      return { label: "不明", cls: "bg-surface-hover text-secondary border-border-default" };
  }
}

function statusLabel(s: string | null): { label: string; cls: string } {
  switch ((s ?? "").toLowerCase()) {
    case "active":
      return { label: "有効", cls: "text-emerald-700" };
    case "void":
      return { label: "無効", cls: "text-red-700" };
    case "expired":
      return { label: "期限切れ", cls: "text-amber-700" };
    default:
      return { label: s || "-", cls: "text-secondary" };
  }
}

function formatDt(iso: string | null): string {
  if (!iso) return "-";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString("ja-JP", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default function AnchorVerifyClient() {
  const [hashInput, setHashInput] = useState("");
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnchorVerifyResult | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const runVerify = useCallback(async (sha: string) => {
    setStage("verifying");
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`/api/insurer/anchor-verify/${sha}`, {
        method: "GET",
        cache: "no-store",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg =
          json?.message ??
          json?.error ??
          (res.status === 404 ? "該当する施工画像が見つかりません。" : `検証APIエラー (HTTP ${res.status})`);
        setError(String(msg));
        setStage("error");
        return;
      }
      setResult(json as AnchorVerifyResult);
      setStage("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "ネットワークエラー");
      setStage("error");
    }
  }, []);

  const handleFile = useCallback(
    async (file: File) => {
      setStage("hashing");
      setError(null);
      setResult(null);
      try {
        const sha = await computeSha256(file);
        setHashInput(sha);
        await runVerify(sha);
      } catch (e) {
        setError(e instanceof Error ? e.message : "ハッシュ計算に失敗しました。");
        setStage("error");
      }
    },
    [runVerify],
  );

  const onSubmit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const normalized = normalizeHash(hashInput);
      if (!normalized) {
        setError("SHA-256 ハッシュの形式が不正です。64桁のhex文字列を指定してください。");
        setStage("error");
        return;
      }
      await runVerify(normalized);
    },
    [hashInput, runVerify],
  );

  const busy = stage === "hashing" || stage === "verifying";

  return (
    <>
      <section className="rounded-2xl border border-border-default bg-surface p-5 shadow-sm">
        <div className="mb-4">
          <div className="text-xs font-semibold tracking-[0.18em] text-muted">INPUT</div>
          <div className="mt-1 text-lg font-semibold text-primary">SHA-256 ハッシュを入力 / 画像をドロップ</div>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label htmlFor="sha256-input" className="mb-1 block text-xs font-semibold text-secondary">
              SHA-256 ハッシュ (64桁 hex, 0x プレフィックス可)
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                id="sha256-input"
                name="sha256"
                value={hashInput}
                onChange={(e) => setHashInput(e.target.value)}
                placeholder="例: 9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08"
                spellCheck={false}
                autoComplete="off"
                className="w-full rounded-xl border border-border-default bg-surface px-3 py-3 font-mono text-xs"
                disabled={busy}
              />
              <button type="submit" className="btn-primary px-4 py-3" disabled={busy}>
                {stage === "verifying" ? "検証中..." : "検証する"}
              </button>
            </div>
          </div>

          <div className="relative">
            <div
              className={`rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors ${
                dragOver ? "border-neutral-500 bg-surface-hover" : "border-border-default bg-inset"
              }`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                if (busy) return;
                const file = e.dataTransfer.files?.[0];
                if (file) void handleFile(file);
              }}
            >
              <div className="text-sm font-medium text-secondary">
                画像ファイルをドロップすると、ブラウザ内で SHA-256 を計算して 自動検証します。
              </div>
              <div className="mt-1 text-xs text-muted">
                画像データは Ledra サーバーには送信されません (ハッシュのみ送信)。
              </div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={busy}
                className="mt-3 rounded-xl border border-border-default bg-surface px-4 py-2 text-sm font-medium text-secondary hover:bg-surface-hover disabled:opacity-50"
              >
                ファイルを選択
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleFile(file);
                  e.currentTarget.value = "";
                }}
              />
            </div>
          </div>
        </form>

        {stage === "hashing" ? (
          <div className="mt-4 rounded-xl border border-border-default bg-inset p-3 text-sm text-secondary">
            ハッシュ計算中...
          </div>
        ) : null}
      </section>

      {stage === "error" && error ? (
        <section className="rounded-2xl border border-red-300 bg-red-50 p-5 shadow-sm">
          <div className="text-lg font-semibold text-red-700">検証失敗</div>
          <div className="mt-2 text-sm text-red-700">{error}</div>
        </section>
      ) : null}

      {stage === "done" && result ? (
        <>
          <section
            className={`rounded-2xl border p-5 shadow-sm ${
              result.onChainVerified ? "border-emerald-300 bg-emerald-50" : "border-amber-300 bg-amber-50"
            }`}
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div
                  className={`text-xs font-semibold tracking-[0.18em] ${
                    result.onChainVerified ? "text-emerald-700" : "text-amber-700"
                  }`}
                >
                  ON-CHAIN VERIFICATION
                </div>
                <div
                  className={`mt-1 text-2xl font-bold ${
                    result.onChainVerified ? "text-emerald-800" : "text-amber-800"
                  }`}
                >
                  {result.onChainVerified ? "アンカー確認済み (真正)" : "アンカー未確認"}
                </div>
                <p className={`mt-2 text-sm ${result.onChainVerified ? "text-emerald-900" : "text-amber-900"}`}>
                  {result.onChainVerified
                    ? "このハッシュは LedraAnchor コントラクトに記録されています。DB メタデータと一致するため、施工画像は改ざんされていません。"
                    : "このハッシュは DB 上には存在しますが、LedraAnchor コントラクトには記録されていません。アンカー前・RPC 障害・未施工の可能性があります。"}
                </p>
              </div>

              {result.explorer_url ? (
                <a href={result.explorer_url} target="_blank" rel="noreferrer" className="btn-primary px-4 py-3">
                  Polygonscan で確認 →
                </a>
              ) : null}
            </div>
          </section>

          <section className="rounded-2xl border border-border-default bg-surface p-5 shadow-sm">
            <div className="mb-4">
              <div className="text-xs font-semibold tracking-[0.18em] text-muted">METADATA</div>
              <div className="mt-1 text-lg font-semibold text-primary">画像メタデータ</div>
            </div>

            <dl className="grid gap-4 md:grid-cols-2">
              <Row label="SHA-256">
                <span className="font-mono text-xs break-all">{result.sha256}</span>
              </Row>

              <Row label="真正性グレード">
                {(() => {
                  const g = gradeLabel(result.authenticity_grade);
                  return (
                    <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${g.cls}`}>
                      {g.label}
                    </span>
                  );
                })()}
              </Row>

              <Row label="Polygon tx_hash">
                {result.polygon_tx_hash ? (
                  <span className="font-mono text-xs break-all">{result.polygon_tx_hash}</span>
                ) : (
                  <span className="text-xs text-muted">未アンカー</span>
                )}
              </Row>

              <Row label="ネットワーク">
                <span className="text-sm">
                  {result.polygon_network === "polygon"
                    ? "Polygon mainnet"
                    : result.polygon_network === "amoy"
                      ? "Polygon Amoy (testnet)"
                      : "-"}
                </span>
              </Row>

              <Row label="C2PA 検証">
                <span
                  className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                    result.c2pa_verified
                      ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                      : "bg-surface-hover text-secondary border-border-default"
                  }`}
                >
                  {result.c2pa_verified ? "検証済み" : "未検証 / 非対応"}
                </span>
              </Row>

              {result.c2pa_manifest ? (
                <>
                  <Row label="C2PA 署名者">
                    <span className="text-sm">
                      {result.c2pa_manifest.signerMode === "production" ? "本番証明書" : "開発用（自己署名）"}
                    </span>
                  </Row>
                  {result.c2pa_manifest.binding.vin ? (
                    <Row label="C2PA 封入VIN">
                      <span className="font-mono text-sm">{result.c2pa_manifest.binding.vin}</span>
                    </Row>
                  ) : null}
                  <Row label="C2PA 撮影台帳">
                    <span className="text-sm">
                      {result.c2pa_manifest.actions.length}件の行為を記録
                      {result.c2pa_manifest.binding.tsaTimestamp ? "・TSA時刻封入" : ""}
                      {result.c2pa_manifest.binding.nonceSealed ? "・撮影nonce封入" : ""}
                    </span>
                  </Row>
                </>
              ) : null}

              <Row label="撮影日時 (EXIF)">
                <span className="text-sm">{formatDt(result.captured_at)}</span>
              </Row>

              <Row label="端末モデル (EXIF)">
                <span className="text-sm">{result.device_model ?? "-"}</span>
              </Row>

              <Row label="画像登録日時">
                <span className="text-sm">{formatDt(result.image_created_at)}</span>
              </Row>

              <Row label="証明書 public_id">
                {result.certificate_public_id ? (
                  <Link
                    href={`/insurer/c/${encodeURIComponent(result.certificate_public_id)}`}
                    className="font-mono text-xs text-sky-700 underline"
                  >
                    {result.certificate_public_id}
                  </Link>
                ) : (
                  <span className="text-xs text-muted">-</span>
                )}
              </Row>

              <Row label="証明書ステータス">
                {(() => {
                  const s = statusLabel(result.certificate_status);
                  return <span className={`text-sm font-medium ${s.cls}`}>{s.label}</span>;
                })()}
              </Row>
            </dl>
          </section>
        </>
      ) : null}
    </>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border-default bg-inset p-3">
      <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted">{label}</dt>
      <dd className="mt-1 text-primary">{children}</dd>
    </div>
  );
}
