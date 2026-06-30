"use client";
import { parseJsonSafe } from "@/lib/api/safeJson";

import { useState, useCallback, useEffect } from "react";

type LineStatus = {
  enabled: boolean;
  channel_id: string | null;
  liff_id: string | null;
  webhook_url: string | null;
  link_prompt_enabled: boolean;
};

export default function LineConnectSection() {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [status, setStatus] = useState<LineStatus | null>(null);
  const [editing, setEditing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Form fields
  const [channelId, setChannelId] = useState("");
  const [channelSecret, setChannelSecret] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [liffId, setLiffId] = useState("");

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/line");
      const j = await parseJsonSafe(res);
      if (res.ok && j) {
        setStatus(j);
        if (j.channel_id) setChannelId(j.channel_id);
        if (j.liff_id) setLiffId(j.liff_id);
      }
    } catch {
      // silently ignore
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const handleConfigure = async () => {
    if (!channelId || !channelSecret || !accessToken) {
      setErr("Channel ID, Channel Secret, Channel Access Token は必須です");
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
          channel_access_token: accessToken,
          liff_id: liffId || undefined,
        }),
      });
      const j = await parseJsonSafe(res);
      if (!res.ok) throw new Error(j?.message ?? j?.error ?? `HTTP ${res.status}`);
      setSuccessMsg("LINE連携が完了しました");
      setEditing(false);
      setChannelSecret("");
      setAccessToken("");
      await fetchStatus();
      setTimeout(() => setSuccessMsg(null), 5000);
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
      setAccessToken("");
      setLiffId("");
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
          {status?.webhook_url && (
            <div>
              <div className="text-xs text-muted mb-1">Webhook URL（LINE Developers Consoleに設定）:</div>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs font-mono bg-[var(--bg-inset)] border border-border-subtle rounded-lg px-3 py-2 text-secondary break-all">
                  {status.webhook_url}
                </code>
                <button type="button" onClick={copyWebhookUrl} className="btn-ghost text-xs shrink-0">
                  {copied ? "コピー済み" : "コピー"}
                </button>
              </div>
            </div>
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
          <div>
            <label className="block text-xs font-medium text-muted mb-1">Channel Access Token *</label>
            <input
              type="password"
              value={accessToken}
              onChange={(e) => setAccessToken(e.target.value)}
              placeholder="長期トークンを発行して貼り付け"
              className="input-field w-full text-sm"
            />
          </div>
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
              <li>LINE Developers Console でMessaging APIチャネルを作成</li>
              <li>チャネル基本設定から Channel ID と Channel Secret を取得</li>
              <li>Messaging API設定から「チャネルアクセストークン（長期）」を発行</li>
              <li>上記の値をこのフォームに入力して「連携する」をクリック</li>
              <li>連携後に表示される Webhook URL を LINE Developers Console の Webhook設定に貼り付け</li>
              <li>Webhookの利用をONに切り替え</li>
            </ol>
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
