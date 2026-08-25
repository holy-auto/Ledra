"use client";
import { parseJsonSafe } from "@/lib/api/safeJson";

import { useState, useCallback, useEffect } from "react";

type LineStatus = {
  enabled: boolean;
  channel_id: string | null;
  liff_id: string | null;
  webhook_url: string | null;
  link_prompt_enabled: boolean;
  /** Ledra がトークンを発行・自動更新しているか（false = 手入力の長期トークン運用） */
  token_auto_managed?: boolean;
};

/** configure / verify が返す接続診断 */
type Diagnostics = {
  bot_display_name?: string | null;
  bot_basic_id?: string | null;
  webhook_active?: boolean;
  webhook_test_ok?: boolean;
  manual_steps?: string[];
};

export default function LineConnectSection() {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [status, setStatus] = useState<LineStatus | null>(null);
  const [editing, setEditing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [diag, setDiag] = useState<Diagnostics | null>(null);

  // Form fields — 必要なのは Channel ID と Channel Secret の2つだけ。
  // アクセストークンの発行と Webhook URL の設定は Ledra が自動で行う。
  const [channelId, setChannelId] = useState("");
  const [channelSecret, setChannelSecret] = useState("");
  const [liffId, setLiffId] = useState("");

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/line");
      const j = await parseJsonSafe(res);
      if (res.ok && j) {
        setStatus(j);
        if (j.channel_id) setChannelId(j.channel_id);
        if (j.liff_id) setLiffId(j.liff_id);
      } else {
        // 状態取得の失敗を握りつぶすと「保存できたのに未連携表示」になるため必ず見せる
        setErr(j?.message ?? j?.error ?? `連携状態の取得に失敗しました (HTTP ${res.status})`);
      }
    } catch {
      setErr("連携状態の取得に失敗しました。ネットワークを確認して再読み込みしてください。");
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const handleConfigure = async () => {
    if (!channelId || !channelSecret) {
      setErr("Channel ID と Channel Secret は必須です");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/admin/line", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "configure",
          channel_id: channelId,
          channel_secret: channelSecret,
          liff_id: liffId || undefined,
        }),
      });
      const j = await parseJsonSafe(res);
      if (!res.ok) throw new Error(j?.message ?? j?.error ?? `HTTP ${res.status}`);
      setDiag(j as Diagnostics);
      const remaining = (j?.manual_steps as string[] | undefined) ?? [];
      setSuccessMsg(
        remaining.length === 0
          ? "LINE連携が完了しました。アクセストークンの発行も Webhook URL の設定も Ledra が済ませています。"
          : "LINE連携を保存しました。あと少しだけ LINE 側の設定が残っています（下記）。",
      );
      setEditing(false);
      setChannelSecret("");
      // 直後の再取得が万一失敗しても Webhook URL は見せられるよう、POST の応答で即時反映する
      if (j?.webhook_url) {
        setStatus((s) => ({
          enabled: true,
          channel_id: channelId,
          liff_id: liffId || null,
          webhook_url: j.webhook_url,
          link_prompt_enabled: s?.link_prompt_enabled ?? false,
          token_auto_managed: true,
        }));
      }
      await fetchStatus();
      setTimeout(() => setSuccessMsg(null), 15000);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  /** 接続を再確認: トークンを発行し直し、Webhook URL を設定し直して配送テストまで行う。 */
  const handleVerify = async () => {
    setBusy(true);
    setErr(null);
    setSuccessMsg(null);
    try {
      const res = await fetch("/api/admin/line", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "verify" }),
      });
      const j = await parseJsonSafe(res);
      if (!res.ok) throw new Error(j?.message ?? j?.error ?? `HTTP ${res.status}`);
      setDiag(j as Diagnostics);
      const remaining = (j?.manual_steps as string[] | undefined) ?? [];
      setSuccessMsg(
        remaining.length === 0
          ? "LINEと正常に接続できています。"
          : "接続を確認しました。残りの設定は下記のとおりです。",
      );
      await fetchStatus();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const handleDisconnect = async () => {
    if (!window.confirm("LINE連携を解除しますか？")) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/admin/line", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "disconnect" }),
      });
      const j = await parseJsonSafe(res);
      if (!res.ok) throw new Error(j?.message ?? j?.error ?? `HTTP ${res.status}`);
      setStatus({ enabled: false, channel_id: null, liff_id: null, webhook_url: null, link_prompt_enabled: false });
      setChannelId("");
      setChannelSecret("");
      setLiffId("");
      setDiag(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const handleToggleLinkPrompt = async (next: boolean) => {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/admin/line", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "set_link_prompt", enabled: next }),
      });
      const j = await parseJsonSafe(res);
      if (!res.ok) throw new Error(j?.message ?? j?.error ?? `HTTP ${res.status}`);
      setStatus((s) => (s ? { ...s, link_prompt_enabled: next } : s));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const copyWebhookUrl = () => {
    if (!status?.webhook_url) return;
    navigator.clipboard.writeText(status.webhook_url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isConnected = status?.enabled ?? false;
  const showForm = !isConnected || editing;

  return (
    <div className="space-y-3">
      <p className="text-sm text-secondary">
        LINE公式アカウントを連携すると、予約確認・リマインダー・書類送付をLINEで自動送信できます。
      </p>

      {/* 料金の目安（設定時に確認できるヘルプ） */}
      <details className="rounded-lg border border-border-subtle bg-surface-hover/30 px-3 py-2 text-xs text-secondary">
        <summary className="cursor-pointer font-medium text-primary hover:text-accent">
          💰 料金の目安（無料／有料の違い）
        </summary>
        <div className="mt-2 space-y-2 leading-relaxed">
          <p>
            <span className="font-medium text-primary">課金されるのは「プッシュ（店から先に送る通知）」だけ</span>
            です。お客様からの問い合わせ・予約相談への自動応答（リプライ）は
            <span className="font-medium">無料・無制限</span>。費用は「店から能動的に送る通数」で決まります。
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-[11px] border-collapse">
              <thead>
                <tr className="text-muted text-left">
                  <th className="py-1 pr-2 font-medium">プラン</th>
                  <th className="py-1 pr-2 font-medium">月額</th>
                  <th className="py-1 pr-2 font-medium">無料プッシュ枠</th>
                  <th className="py-1 font-medium">超過</th>
                </tr>
              </thead>
              <tbody className="text-secondary">
                <tr className="border-t border-border-subtle">
                  <td className="py-1 pr-2">コミュニケーション</td>
                  <td className="py-1 pr-2">¥0</td>
                  <td className="py-1 pr-2">200通/月</td>
                  <td className="py-1">送れない</td>
                </tr>
                <tr className="border-t border-border-subtle">
                  <td className="py-1 pr-2">ライト</td>
                  <td className="py-1 pr-2">¥5,000</td>
                  <td className="py-1 pr-2">5,000通/月</td>
                  <td className="py-1">送れない</td>
                </tr>
                <tr className="border-t border-border-subtle">
                  <td className="py-1 pr-2">スタンダード</td>
                  <td className="py-1 pr-2">¥15,000</td>
                  <td className="py-1 pr-2">30,000通/月</td>
                  <td className="py-1">従量（〜¥3/通）</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-muted">
            ※「1通」＝1人へ1メッセージ。100人へ一斉配信すると100通。料金は改定される場合があります。
          </p>
          <div>
            <div className="font-medium text-primary">有料化が増える主な条件</div>
            <ul className="mt-1 ml-4 list-disc space-y-0.5">
              <li>
                <span className="font-medium">一斉配信の頻度・対象人数</span>（友だち数×回数で一気に増える＝最大要因）
              </li>
              <li>友だち（連携）数の増加（配信・誕生日・リマインダーの母数）</li>
              <li>月間の予約・作業台数（確認＋リマインダーで1台2〜3通）</li>
              <li>リマインダーを「前日＋当日」など複数回送る設定</li>
              <li>請求書・見積・決済リンクのLINE送付比率</li>
              <li>鈑金など多工程案件（工程ごとの進捗通知）／点検・車検の定期リマインダー対象数</li>
              <li>受信箱からのスタッフ手動返信（プッシュ扱い）</li>
            </ul>
          </div>
          <div>
            <div className="font-medium text-primary">目安</div>
            <ul className="mt-1 ml-4 list-disc space-y-0.5">
              <li>配信せず個別通知中心（月30台規模・友だち数百）→ だいたい無料〜ライト</li>
              <li>月1回ほど配信＋通常運用（月100台・友だち1,000）→ ライト</li>
              <li>配信を月2回以上 or 友だち2,000人超 → スタンダード検討</li>
            </ul>
          </div>
          <p className="text-muted">
            費用を抑えるコツ：会話で済むことは自動応答（無料）に寄せる／一斉配信はセグメントで人数を絞る／リマインダーは1通にまとめる／社内連絡はアプリ内通知で。
          </p>
        </div>
      </details>

      {/* Status indicator */}
      <div className="flex items-center gap-3 text-sm">
        <span className="text-muted">ステータス:</span>
        <span className={`inline-flex items-center gap-1.5 font-medium ${isConnected ? "text-success" : "text-muted"}`}>
          <span className={`w-2 h-2 rounded-full ${isConnected ? "bg-success" : "bg-[var(--text-muted)]"}`} />
          {isConnected ? "連携中" : "未連携"}
        </span>
      </div>

      {/* Connection details (when connected and not editing) */}
      {isConnected && !editing && (
        <div className="text-sm text-secondary space-y-2">
          <div className="text-xs text-muted font-mono">Channel ID: {status?.channel_id}</div>
          {status?.liff_id && <div className="text-xs text-muted font-mono">LIFF ID: {status.liff_id}</div>}
          {diag?.bot_display_name && (
            <div className="text-xs text-muted">
              接続先: <span className="text-primary">{diag.bot_display_name}</span>
              {diag.bot_basic_id && <span className="ml-1 font-mono">({diag.bot_basic_id})</span>}
            </div>
          )}
          {status?.token_auto_managed && (
            <div className="text-xs text-muted">
              アクセストークンはLedraが自動で発行・更新しています（手動での再発行は不要です）。
            </div>
          )}

          {/* 残った手作業だけを出す。空なら「全部済んでいる」と言い切る。 */}
          {diag?.manual_steps && diag.manual_steps.length > 0 && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
              <div className="text-xs font-medium text-amber-500">LINE側で残っている設定</div>
              <ul className="mt-1 ml-4 list-disc space-y-1 text-xs text-secondary">
                {diag.manual_steps.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
              <a
                href="https://developers.line.biz/console/"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-block text-xs text-accent underline hover:no-underline"
              >
                LINE Developers Console を開く →
              </a>
            </div>
          )}

          {/* Webhook URL は Ledra が自動設定するので通常は不要。手で確認したい人向けに折りたたむ。 */}
          {status?.webhook_url && (
            <details className="text-xs text-muted">
              <summary className="cursor-pointer transition-colors hover:text-secondary">
                Webhook URL を確認する（Ledraが設定済み）
              </summary>
              <div className="mt-2 flex items-center gap-2">
                <code className="flex-1 break-all rounded-lg border border-border-subtle bg-[var(--bg-inset)] px-3 py-2 font-mono text-xs text-secondary">
                  {status.webhook_url}
                </code>
                <button type="button" onClick={copyWebhookUrl} className="btn-ghost shrink-0 text-xs">
                  {copied ? "コピー済み" : "コピー"}
                </button>
              </div>
            </details>
          )}
        </div>
      )}

      {/* Success message */}
      {successMsg && (
        <div className="rounded-xl border border-success/30 bg-success-dim px-4 py-3 text-sm text-success">
          {successMsg}
        </div>
      )}

      {/* Error */}
      {err && <div className="text-sm text-red-500">{err}</div>}

      {/* Configuration form */}
      {showForm && (
        <div className="space-y-3 pt-1">
          <div>
            <label className="block text-xs font-medium text-muted mb-1">Channel ID *</label>
            <input
              type="text"
              value={channelId}
              onChange={(e) => setChannelId(e.target.value)}
              placeholder="1234567890"
              className="input-field w-full text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted mb-1">Channel Secret *</label>
            <input
              type="password"
              value={channelSecret}
              onChange={(e) => setChannelSecret(e.target.value)}
              placeholder="LINE Developers Consoleから取得"
              className="input-field w-full text-sm"
            />
          </div>
          <p className="rounded-lg border border-border-subtle bg-surface-hover/30 px-3 py-2 text-xs text-secondary">
            入力はこの2つだけです。<span className="font-medium text-primary">アクセストークンの発行</span>と
            <span className="font-medium text-primary">Webhook URLの設定</span>
            はLedraが自動で行うため、LINE Developers Console でトークンを発行したり URL
            を貼り戻したりする必要はありません。
          </p>
          <div>
            <label className="block text-xs font-medium text-muted mb-1">LIFF ID（任意）</label>
            <input
              type="text"
              value={liffId}
              onChange={(e) => setLiffId(e.target.value)}
              placeholder="予約画面をLIFFアプリとして利用する場合"
              className="input-field w-full text-sm"
            />
          </div>

          {/* Setup guide */}
          <details className="text-xs text-muted">
            <summary className="cursor-pointer hover:text-secondary transition-colors">設定手順を確認</summary>
            <ol className="mt-2 ml-4 space-y-1 list-decimal">
              <li>
                LINE公式アカウントがまだ無い場合は{" "}
                <a
                  href="https://manager.line.biz/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent underline hover:no-underline"
                >
                  LINE公式アカウント管理画面
                </a>{" "}
                から無料で開設
              </li>
              <li>
                <a
                  href="https://developers.line.biz/console/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent underline hover:no-underline"
                >
                  LINE Developers Console
                </a>{" "}
                を開き、公式アカウントに紐づく Messaging API チャネルを作成（無い場合は「新規チャネル作成 → Messaging
                API」）
              </li>
              <li>「チャネル基本設定」タブから Channel ID と Channel Secret をコピー</li>
              <li>その2つをこのフォームに貼り付けて「連携する」をクリック（ここまでで基本は完了）</li>
              <li>
                「Messaging API設定」で「Webhookの利用」がOFFのままなら、ONにする。
                <span className="text-secondary">URLはLedraが設定済みなので、貼り付ける必要はありません。</span>
              </li>
            </ol>
            <p className="mt-2">
              以前は「長期アクセストークンの発行」と「Webhook URL の貼り戻し」も必要でしたが、どちらも Ledra
              が自動で行うようになりました。トークンの更新も自動です。
            </p>
          </details>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-3 flex-wrap">
        {showForm && (
          <>
            <button type="button" className="btn-primary text-sm" disabled={busy} onClick={handleConfigure}>
              {busy ? "処理中..." : isConnected ? "設定を更新" : "連携する"}
            </button>
            {editing && (
              <button type="button" className="btn-ghost text-sm" onClick={() => setEditing(false)}>
                キャンセル
              </button>
            )}
          </>
        )}
        {isConnected && !editing && (
          <>
            <button type="button" className="btn-secondary text-sm" disabled={busy} onClick={handleVerify}>
              {busy ? "確認中…" : "接続を再確認"}
            </button>
            <button type="button" className="btn-secondary text-sm" onClick={() => setEditing(true)}>
              設定変更
            </button>
            <button
              type="button"
              className="text-sm text-red-500 hover:text-red-700 transition-colors px-3 py-1.5"
              disabled={busy}
              onClick={handleDisconnect}
            >
              連携解除
            </button>
          </>
        )}
      </div>

      {/* Connected hint */}
      {isConnected && !editing && (
        <div className="mt-3 rounded-lg bg-success-dim border border-success/30 p-3">
          <p className="text-sm text-success">
            LINE連携が有効です。予約確認・リマインダー・書類リンクが自動送信されます。
          </p>
        </div>
      )}

      {/* 連携案内の自動返信トグル */}
      {isConnected && !editing && (
        <div className="mt-3 rounded-lg border border-border-subtle p-3 space-y-2">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={status?.link_prompt_enabled ?? false}
              disabled={busy}
              onChange={(e) => handleToggleLinkPrompt(e.target.checked)}
              className="mt-0.5"
            />
            <span className="text-sm text-secondary">
              <span className="font-medium text-primary">未連携のお客様に連携案内を自動返信する</span>
              <br />
              <span className="text-xs text-muted">
                まだ顧客に紐づいていないLINEユーザーとのやり取りが少し進んだ段階で、連携のお願い（既存のお客様＝連携コード入力／はじめての方＝登録フォーム）を1度だけ自動送信します。
              </span>
            </span>
          </label>
        </div>
      )}
    </div>
  );
}
