"use client";

/**
 * PasskeySection
 * ------------------------------------------------------------
 * WebAuthn パスキー(操作署名用の認証器)の登録・一覧・失効 UI。
 *
 * 重要操作(証明書の確定/取消 等)を「登録済み認証器の本人」に暗号的に束ねる操作署名の
 * 前提となる、認証器の登録セレモニー(navigator.credentials.create)を提供する。
 * サーバ側フラグ WEBAUTHN_OPERATION_SIGNING が off の間も登録自体は可能(先に登録しておける)。
 */

import { useCallback, useEffect, useState } from "react";
import { formatDateTime } from "@/lib/format";
import {
  isWebAuthnSupported,
  registerPasskey,
  listPasskeys,
  revokePasskey,
  type PasskeyRow,
} from "@/lib/webauthn/browserCeremony";
import type { OperationSigningMode } from "@/lib/webauthn/config";

const MODE_LABEL: Record<OperationSigningMode, string> = {
  off: "無効(登録は可能。重要操作では要求されません)",
  optional: "任意(登録済みなら重要操作でパスキー承認を要求)",
  enforce: "必須(重要操作にパスキー承認が必要)",
};

export default function PasskeySection() {
  const [rows, setRows] = useState<PasskeyRow[]>([]);
  const [mode, setMode] = useState<OperationSigningMode>("off");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [label, setLabel] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const supported = isWebAuthnSupported();

  const refresh = useCallback(async () => {
    try {
      const { credentials, mode } = await listPasskeys();
      setRows(credentials);
      setMode(mode);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function onRegister() {
    setBusy(true);
    setErr(null);
    setOk(null);
    try {
      await registerPasskey(label);
      setOk("パスキーを登録しました。");
      setLabel("");
      await refresh();
    } catch (e) {
      // ユーザーがキャンセルした場合(NotAllowedError)は静かに戻す
      const msg = e instanceof Error ? e.message : String(e);
      if (/NotAllowed|AbortError|cancel/i.test(msg)) setErr("登録がキャンセルされました。");
      else setErr(msg);
    } finally {
      setBusy(false);
    }
  }

  async function onRevoke(id: string) {
    if (!confirm("このパスキーを失効します。よろしいですか？")) return;
    setBusy(true);
    setErr(null);
    setOk(null);
    try {
      await revokePasskey(id);
      setOk("パスキーを失効しました。");
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="glass-card p-5 space-y-5">
      <div>
        <div className="text-xs font-semibold tracking-[0.18em] text-muted">PASSKEY / WEBAUTHN</div>
        <div className="mt-1 text-base font-semibold text-primary">パスキー(操作署名)</div>
        <p className="mt-1 text-xs text-muted">
          スマホの生体認証やセキュリティキーを登録し、証明書の確定など重要操作を「登録済み端末の本人」に
          暗号的に束ねます。パスキーは鍵がデバイスから出ず、フィッシングにも強い認証方式です。
        </p>
        <p className="mt-1 text-xs text-secondary">
          現在の運用モード: <span className="font-semibold text-primary">{MODE_LABEL[mode]}</span>
        </p>
      </div>

      {err && (
        <div className="rounded-lg border border-danger/20 bg-danger-dim px-3 py-2 text-xs text-danger-text">{err}</div>
      )}
      {ok && (
        <div className="rounded-lg border border-success/20 bg-success-dim px-3 py-2 text-xs text-success-text">
          {ok}
        </div>
      )}

      {!supported && (
        <div className="rounded-lg border border-warning/20 bg-warning-dim px-3 py-2 text-xs text-warning-text">
          このブラウザはパスキー(WebAuthn)に対応していません。
        </div>
      )}

      {/* 登録済み一覧 */}
      <div className="rounded-xl border border-border-default bg-base p-4">
        <div className="text-sm font-semibold text-primary">登録済みのパスキー</div>
        {loading ? (
          <div className="mt-2 text-xs text-muted">読み込み中...</div>
        ) : rows.length === 0 ? (
          <div className="mt-2 text-xs text-secondary">未登録 — 下のボタンから登録できます。</div>
        ) : (
          <ul className="mt-3 space-y-2">
            {rows.map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-border-default bg-surface px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm text-primary">
                    {r.device_label || "パスキー"}
                    {r.backed_up && (
                      <span className="ml-2 rounded-full border border-border-default px-2 py-0.5 text-[10px] text-muted">
                        同期パスキー
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-muted">
                    登録: {formatDateTime(r.created_at)}
                    {r.last_used_at ? ` / 最終使用: ${formatDateTime(r.last_used_at)}` : ""}
                  </div>
                </div>
                <button type="button" className="btn-danger text-xs" onClick={() => onRevoke(r.id)} disabled={busy}>
                  失効
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* 新規登録 */}
      {supported && (
        <div className="space-y-3 rounded-xl border border-border-default bg-base p-4">
          <div className="text-sm font-semibold text-primary">パスキーを登録する</div>
          <div className="space-y-1">
            <label className="text-xs text-muted">デバイス名 (任意 /「iPhone」「YubiKey」など)</label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="例: 業務用 iPhone"
              className="input-field"
              disabled={busy}
              maxLength={100}
            />
          </div>
          <button type="button" className="btn-primary text-sm" onClick={onRegister} disabled={busy}>
            {busy ? "処理中..." : "この端末にパスキーを登録"}
          </button>
        </div>
      )}
    </section>
  );
}
