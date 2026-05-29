"use client";

/**
 * AI 自動入力設定ページ下部に置く「AI サンドボックス」。
 *
 * 既存の admin 画面に UI 接続点が無いエンドポイント
 * (reviews/ai-sentiment, accounting/ai-categorize, master-data/normalize) の
 * 動作確認 + 運営が手動で AI 機能を試すための簡易フォーム。
 *
 * 設定変更前後の挙動を比較できるよう、しきい値・ポリシーは API 側で評価される
 * 設定をそのまま適用 (このコンポーネントはオーバーライドしない)。
 */
import { useState } from "react";

export default function AiSandboxPanels() {
  return (
    <section className="glass-card p-5 space-y-4">
      <div>
        <div className="text-xs font-semibold tracking-[0.18em] text-muted">SANDBOX</div>
        <div className="mt-1 text-base font-semibold text-primary">AI 機能テスト</div>
        <p className="mt-1 text-xs text-muted">
          まだ専用 UI が無い AI 機能 (レビュー解析 / 仕訳科目推定 / マスタ正規化) を試せます。
          実際の業務画面が追加されたら自動で同じ API が叩かれます。
        </p>
      </div>

      <ReviewSentimentSandbox />
      <AccountingCategorizeSandbox />
      <NormalizeSandbox />
    </section>
  );
}

function ReviewSentimentSandbox() {
  const [text, setText] = useState("施工は丁寧でしたが、待ち時間が長すぎました。");
  const [nps, setNps] = useState<string>("6");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<unknown>(null);
  const [err, setErr] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setErr(null);
    setResult(null);
    try {
      const npsScore = nps === "" ? undefined : Number(nps);
      const res = await fetch("/api/admin/reviews/ai-sentiment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, nps_score: npsScore }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(j?.message ?? `エラー (${res.status})`);
        return;
      }
      setResult(j);
    } catch {
      setErr("通信エラー");
    } finally {
      setLoading(false);
    }
  }

  return (
    <details className="rounded-xl border border-border-default bg-base p-4">
      <summary className="cursor-pointer text-sm font-semibold text-primary">レビュー / NPS センチメント</summary>
      <div className="mt-3 space-y-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          className="w-full input-field text-sm"
          placeholder="レビュー本文"
        />
        <label className="flex items-center gap-2 text-xs">
          NPS スコア (0〜10):
          <input
            value={nps}
            onChange={(e) => setNps(e.target.value)}
            inputMode="numeric"
            className="input-field text-sm w-16"
          />
        </label>
        <button onClick={run} disabled={loading} className="btn-ghost text-xs py-1 px-2">
          {loading ? "解析中…" : "解析"}
        </button>
        {err && <div className="text-xs text-danger-text">{err}</div>}
        {result != null && (
          <pre className="rounded-lg bg-surface px-3 py-2 text-[11px] text-secondary overflow-auto max-h-60">
            {JSON.stringify(result, null, 2)}
          </pre>
        )}
      </div>
    </details>
  );
}

function AccountingCategorizeSandbox() {
  const [accountsJson, setAccountsJson] = useState(
    JSON.stringify(
      [
        { code: "411", label: "売上高", keywords: ["施工", "コーティング", "コート", "PPF"] },
        { code: "501", label: "売上原価", keywords: ["材料", "薬剤", "コーティング剤"] },
        { code: "742", label: "雑収入", keywords: ["値引", "返金"] },
      ],
      null,
      2,
    ),
  );
  const [linesJson, setLinesJson] = useState(
    JSON.stringify(
      [
        { description: "ガラスコーティング施工", amount: 60000 },
        { description: "養生材", amount: 1200 },
      ],
      null,
      2,
    ),
  );
  const [fallbackCode, setFallbackCode] = useState("411");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<unknown>(null);
  const [err, setErr] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setErr(null);
    setResult(null);
    try {
      const accounts = JSON.parse(accountsJson);
      const lines = JSON.parse(linesJson);
      const res = await fetch("/api/admin/accounting/ai-categorize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accounts, lines, fallback_code: fallbackCode }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(j?.message ?? `エラー (${res.status})`);
        return;
      }
      setResult(j);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "通信エラー");
    } finally {
      setLoading(false);
    }
  }

  return (
    <details className="rounded-xl border border-border-default bg-base p-4">
      <summary className="cursor-pointer text-sm font-semibold text-primary">仕訳科目推定</summary>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <label className="space-y-1 text-xs">
          <div className="text-muted">勘定マスタ (JSON)</div>
          <textarea
            value={accountsJson}
            onChange={(e) => setAccountsJson(e.target.value)}
            rows={8}
            className="w-full font-mono input-field text-[11px]"
          />
        </label>
        <label className="space-y-1 text-xs">
          <div className="text-muted">明細 (JSON)</div>
          <textarea
            value={linesJson}
            onChange={(e) => setLinesJson(e.target.value)}
            rows={8}
            className="w-full font-mono input-field text-[11px]"
          />
        </label>
      </div>
      <div className="mt-2 flex items-center gap-2 text-xs">
        <label className="flex items-center gap-1">
          fallback_code:
          <input
            value={fallbackCode}
            onChange={(e) => setFallbackCode(e.target.value)}
            className="input-field text-xs w-20"
          />
        </label>
        <button onClick={run} disabled={loading} className="btn-ghost text-xs py-1 px-2">
          {loading ? "推定中…" : "推定"}
        </button>
      </div>
      {err && <div className="mt-2 text-xs text-danger-text">{err}</div>}
      {result != null && (
        <pre className="mt-2 rounded-lg bg-surface px-3 py-2 text-[11px] text-secondary overflow-auto max-h-60">
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </details>
  );
}

function NormalizeSandbox() {
  const [maker, setMaker] = useState("TOYOTA");
  const [model, setModel] = useState("prius");
  const [address, setAddress] = useState("東京渋谷区道玄坂１２３");
  const [postal, setPostal] = useState("1500043");
  const [name, setName] = useState("山田　　太郎");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<unknown>(null);
  const [err, setErr] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setErr(null);
    setResult(null);
    try {
      const res = await fetch("/api/admin/master-data/normalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ maker, model, address, postal_code: postal, customer_name: name }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(j?.message ?? `エラー (${res.status})`);
        return;
      }
      setResult(j);
    } catch {
      setErr("通信エラー");
    } finally {
      setLoading(false);
    }
  }

  return (
    <details className="rounded-xl border border-border-default bg-base p-4">
      <summary className="cursor-pointer text-sm font-semibold text-primary">マスタ正規化</summary>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <label className="text-xs space-y-1">
          <div className="text-muted">メーカー</div>
          <input value={maker} onChange={(e) => setMaker(e.target.value)} className="input-field text-sm" />
        </label>
        <label className="text-xs space-y-1">
          <div className="text-muted">車種</div>
          <input value={model} onChange={(e) => setModel(e.target.value)} className="input-field text-sm" />
        </label>
        <label className="text-xs space-y-1 sm:col-span-2">
          <div className="text-muted">住所</div>
          <input value={address} onChange={(e) => setAddress(e.target.value)} className="input-field text-sm" />
        </label>
        <label className="text-xs space-y-1">
          <div className="text-muted">郵便番号</div>
          <input value={postal} onChange={(e) => setPostal(e.target.value)} className="input-field text-sm" />
        </label>
        <label className="text-xs space-y-1">
          <div className="text-muted">顧客名</div>
          <input value={name} onChange={(e) => setName(e.target.value)} className="input-field text-sm" />
        </label>
      </div>
      <div className="mt-2">
        <button onClick={run} disabled={loading} className="btn-ghost text-xs py-1 px-2">
          {loading ? "正規化中…" : "正規化"}
        </button>
      </div>
      {err && <div className="mt-2 text-xs text-danger-text">{err}</div>}
      {result != null && (
        <pre className="mt-2 rounded-lg bg-surface px-3 py-2 text-[11px] text-secondary overflow-auto max-h-60">
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </details>
  );
}
