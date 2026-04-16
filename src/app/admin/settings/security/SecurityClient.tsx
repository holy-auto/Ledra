"use client";

import { useEffect, useState } from "react";
import { createClient as createBrowserSupabaseClient } from "@/lib/supabase/client";
import { formatDateTime } from "@/lib/format";

/**
 * SecurityClient
 * ------------------------------------------------------------
 * 2 要素認証 (TOTP) の有効化・検証・解除を行うクライアントコンポーネント。
 *
 * Supabase Auth MFA API を直接叩く:
 *   - enroll({ factorType: "totp" }) → QR コード (svg) + secret + challenge を取得
 *   - verify({ factorId, challengeId, code })       → 6 桁コードで有効化
 *   - listFactors()                                  → 現在の factor 一覧
 *   - unenroll({ factorId })                         → 解除
 *
 * 設計判断:
 * - Supabase SDK が返す totp.qr_code は SVG 文字列なので
 *   `dangerouslySetInnerHTML` で描画 (信頼できる自ソース)
 * - バックアップコードは Supabase Auth では現状未サポートのため
 *   「予備のデバイス (例: 1Password / Authy) を併用してください」と
 *   明示的にガイド
 */

type TotpFactor = {
  id: string;
  friendlyName: string | null;
  status: "verified" | "unverified" | string;
  createdAt: string;
};

interface Props {
  initialTotpFactors: TotpFactor[];
}

type EnrollState = {
  factorId: string;
  challengeId: string;
  qrSvg: string;
  secret: string;
  uri: string;
};

export default function SecurityClient({ initialTotpFactors }: Props) {
  const supabase = createBrowserSupabaseClient();
  const [factors, setFactors] = useState<TotpFactor[]>(initialTotpFactors);
  const [enroll, setEnroll] = useState<EnrollState | null>(null);
  const [friendlyName, setFriendlyName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const verifiedFactor = factors.find((f) => f.status === "verified") ?? null;

  async function refreshFactors() {
    const { data } = await supabase.auth.mfa.listFactors();
    setFactors(
      (data?.totp ?? []).map((f) => ({
        id: f.id,
        friendlyName: f.friendly_name ?? null,
        status: f.status,
        createdAt: f.created_at,
      })),
    );
  }

  // 初期化時に unverified factor が残っていたらクリーンアップ
  useEffect(() => {
    (async () => {
      const leftovers = factors.filter((f) => f.status === "unverified");
      if (leftovers.length === 0) return;
      await Promise.all(
        leftovers.map((f) => supabase.auth.mfa.unenroll({ factorId: f.id })),
      );
      await refreshFactors();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function startEnroll() {
    setBusy(true);
    setErr(null);
    setOk(null);
    try {
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: friendlyName.trim() || `Ledra (${new Date().toISOString().slice(0, 10)})`,
      });
      if (error) throw error;
      if (!data) throw new Error("enroll response is empty");

      // enroll 直後に challenge を発行
      const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({
        factorId: data.id,
      });
      if (chErr) throw chErr;

      setEnroll({
        factorId: data.id,
        challengeId: ch.id,
        qrSvg: data.totp.qr_code,
        secret: data.totp.secret,
        uri: data.totp.uri,
      });
      setCode("");
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode() {
    if (!enroll) return;
    if (!/^\d{6}$/.test(code)) {
      setErr("6 桁の数字を入力してください。");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const { error } = await supabase.auth.mfa.verify({
        factorId: enroll.factorId,
        challengeId: enroll.challengeId,
        code,
      });
      if (error) throw error;
      setOk("2 要素認証を有効化しました。次回ログインから必須になります。");
      setEnroll(null);
      setCode("");
      setFriendlyName("");
      await refreshFactors();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function cancelEnroll() {
    if (!enroll) return;
    setBusy(true);
    try {
      await supabase.auth.mfa.unenroll({ factorId: enroll.factorId });
    } catch {
      /* ignore */
    } finally {
      setEnroll(null);
      setCode("");
      setBusy(false);
      await refreshFactors();
    }
  }

  async function unenrollFactor(factorId: string) {
    if (
      !confirm(
        "2 要素認証を解除します。解除後はパスワードのみでログインできるようになります。よろしいですか？",
      )
    ) {
      return;
    }
    setBusy(true);
    setErr(null);
    setOk(null);
    try {
      const { error } = await supabase.auth.mfa.unenroll({ factorId });
      if (error) throw error;
      setOk("2 要素認証を解除しました。");
      await refreshFactors();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="glass-card p-5 space-y-5">
      <div>
        <div className="text-xs font-semibold tracking-[0.18em] text-muted">
          TWO-FACTOR AUTH
        </div>
        <div className="mt-1 text-base font-semibold text-primary">
          2 要素認証 (TOTP)
        </div>
        <p className="mt-1 text-xs text-muted">
          Google Authenticator / 1Password / Authy 等の認証アプリで生成される
          6 桁コードを使って、ログイン時の本人確認を強化します。
        </p>
      </div>

      {err && (
        <div className="rounded-lg border border-danger/20 bg-danger-dim px-3 py-2 text-xs text-danger-text">
          {err}
        </div>
      )}
      {ok && (
        <div className="rounded-lg border border-success/20 bg-success-dim px-3 py-2 text-xs text-success-text">
          {ok}
        </div>
      )}

      {/* 現在のステータス */}
      <div className="flex items-center justify-between gap-4 rounded-xl border border-border-default bg-base p-4">
        <div>
          <div className="text-sm font-semibold text-primary">現在のステータス</div>
          <div className="mt-1 text-xs text-secondary">
            {verifiedFactor
              ? `有効化済み (${verifiedFactor.friendlyName ?? "TOTP"} / ${formatDateTime(verifiedFactor.createdAt)})`
              : "未設定 — パスワード認証のみ"}
          </div>
        </div>
        <span
          className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${
            verifiedFactor
              ? "border-success/20 bg-success-dim text-success-text"
              : "border-warning/20 bg-warning-dim text-warning-text"
          }`}
        >
          {verifiedFactor ? "ON" : "OFF"}
        </span>
      </div>

      {/* Enroll フロー */}
      {!verifiedFactor && !enroll && (
        <div className="space-y-3 rounded-xl border border-border-default bg-base p-4">
          <div className="text-sm font-semibold text-primary">
            2 要素認証を有効化する
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted">
              デバイス名 (任意 / 「iPhone 15」「業務用 iPad」など)
            </label>
            <input
              type="text"
              value={friendlyName}
              onChange={(e) => setFriendlyName(e.target.value)}
              placeholder="例: 業務用 iPhone"
              className="input-field"
              disabled={busy}
            />
          </div>
          <button
            type="button"
            className="btn-primary text-sm"
            onClick={startEnroll}
            disabled={busy}
          >
            {busy ? "処理中..." : "QR コードを生成して設定を開始"}
          </button>
        </div>
      )}

      {/* Enroll 中: QR + 6 桁コード入力 */}
      {enroll && (
        <div className="space-y-4 rounded-xl border border-accent/20 bg-accent-dim/40 p-4">
          <div className="text-sm font-semibold text-primary">
            認証アプリで QR コードをスキャンしてください
          </div>
          <div className="flex flex-col lg:flex-row gap-4 items-start">
            <div
              className="rounded-lg bg-white p-3 shrink-0"
              aria-label="TOTP QR Code"
              dangerouslySetInnerHTML={{ __html: enroll.qrSvg }}
            />
            <div className="space-y-2 text-xs text-secondary flex-1">
              <div>
                <div className="text-muted">QR が読めない場合はシークレットを手入力:</div>
                <div className="mt-1 font-mono text-[13px] break-all rounded bg-inset px-2 py-1 text-primary">
                  {enroll.secret}
                </div>
              </div>
              <div className="text-muted">
                登録後、認証アプリに表示される 6 桁コードを入力してください:
              </div>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                placeholder="123456"
                className="input-field font-mono tracking-[0.3em] text-center text-lg"
                disabled={busy}
                autoFocus
              />
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  className="btn-primary text-sm"
                  onClick={verifyCode}
                  disabled={busy || code.length !== 6}
                >
                  {busy ? "検証中..." : "検証して有効化"}
                </button>
                <button
                  type="button"
                  className="btn-ghost text-sm"
                  onClick={cancelEnroll}
                  disabled={busy}
                >
                  キャンセル
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 有効化済み: 解除ボタン */}
      {verifiedFactor && !enroll && (
        <div className="space-y-3 rounded-xl border border-border-default bg-base p-4">
          <div className="text-sm text-secondary">
            認証デバイスを紛失した場合や、使用しているアプリを変更する場合は
            一度解除して再登録してください。
          </div>
          <button
            type="button"
            className="btn-danger text-sm"
            onClick={() => unenrollFactor(verifiedFactor.id)}
            disabled={busy}
          >
            {busy ? "処理中..." : "2 要素認証を解除する"}
          </button>
        </div>
      )}
    </section>
  );
}
