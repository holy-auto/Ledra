"use client";

/**
 * 音声メモパネル — 喋った内容を Web Speech API で書き起こし、サーバ側で
 * Anthropic Haiku に整形させて証明書フィールドへ流し込む。
 *
 * リテラシー対策:
 * - マイクボタンが目立つように 1 つだけ。録音中は赤い波紋アニメで視認可能
 * - 自動でフィールドに入力されるので、ユーザは「喋る → 確認」だけで完了
 * - 失敗 / 非対応ブラウザでも普通の textarea で代替できる
 *
 * Web Speech API は iOS Safari / Android Chrome / Desktop Chrome で動く。
 * Firefox は非対応 → mic ボタンを無効化し、手入力に降格。
 */

import { useEffect, useRef, useState } from "react";

/**
 * variant で 2 用途を切り替える:
 * - "certificate" (既定): /api/admin/certificates/voice-memo を叩き、証明書ドラフト
 *   {title/description/cautions} を onApply に渡す。証明書作成フォーム専用の既存挙動。
 * - "note": /api/admin/voice-note を叩き、案件の備考向け単一テキスト (note) を
 *   onApply に渡す。予約・板金案件の「備考」欄に流し込む。
 */
type CommonProps = {
  serviceType?: string;
  vehicleHint?: string;
  customerHint?: string;
  /** BCP 47 音声認識言語。省略時 "ja-JP"。 */
  speechLang?: string;
};
type CertVariantProps = CommonProps & {
  variant?: "certificate";
  onApply: (draft: { title: string; description: string; cautions: string }) => void;
};
type NoteVariantProps = CommonProps & {
  variant: "note";
  onApply: (note: string) => void;
};
type Props = CertVariantProps | NoteVariantProps;

// Web Speech API の型は標準では曖昧なので最小定義
type SpeechRecognitionInstance = {
  start: () => void;
  stop: () => void;
  abort: () => void;
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((ev: any) => void) | null;
  onerror: ((ev: any) => void) | null;
  onend: ((ev: any) => void) | null;
};

function getSpeechRecognitionCtor(): null | (new () => SpeechRecognitionInstance) {
  if (typeof window === "undefined") return null;
  const w = window as any;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

// ブラウザの SpeechRecognition は同時に1セッションしか動かせないため、同一ページに
// 複数の VoiceMemoPanel（施工内容用・備考用）があっても録音は常に1つに制限する。
// ponytail: プロセス内グローバル変数によるロック（複数タブ間では効かない）。
let activeRecorderId: symbol | null = null;

export default function VoiceMemoPanel(props: Props) {
  const { serviceType, vehicleHint, customerHint, speechLang } = props;
  const isNote = props.variant === "note";
  const [instanceId] = useState(() => Symbol("voice-memo-panel"));
  const [open, setOpen] = useState(false);
  const [supported, setSupported] = useState(true);
  const [recording, setRecording] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [interim, setInterim] = useState("");
  const [generating, setGenerating] = useState(false);
  const [applied, setApplied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<SpeechRecognitionInstance | null>(null);

  useEffect(() => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      setSupported(false);
      return;
    }
    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = speechLang ?? "ja-JP";
    rec.onresult = (ev: any) => {
      let finalText = "";
      let interimText = "";
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const result = ev.results[i];
        if (result.isFinal) finalText += result[0].transcript;
        else interimText += result[0].transcript;
      }
      if (finalText) setTranscript((prev) => (prev ? `${prev}${finalText}` : finalText));
      setInterim(interimText);
    };
    rec.onerror = (ev: any) => {
      setError(`認識エラー: ${ev?.error ?? "unknown"}`);
      setRecording(false);
    };
    rec.onend = () => {
      if (activeRecorderId === instanceId) activeRecorderId = null;
      setRecording(false);
      setInterim("");
    };
    recRef.current = rec;
    return () => {
      try {
        rec.abort();
      } catch {
        // already stopped
      }
      if (activeRecorderId === instanceId) activeRecorderId = null;
    };
  }, [speechLang, instanceId]);

  const startRecording = () => {
    setError(null);
    setApplied(false);
    const rec = recRef.current;
    if (!rec) return;
    if (activeRecorderId && activeRecorderId !== instanceId) {
      setError("他の音声メモが録音中です。先に停止してください。");
      return;
    }
    try {
      rec.start();
      activeRecorderId = instanceId;
      setRecording(true);
    } catch (e: any) {
      setError(e?.message ?? "録音を開始できませんでした");
    }
  };

  const stopRecording = () => {
    recRef.current?.stop();
    if (activeRecorderId === instanceId) activeRecorderId = null;
    setRecording(false);
  };

  const generate = async () => {
    const finalTranscript = (transcript + (interim ? ` ${interim}` : "")).trim();
    if (!finalTranscript) {
      setError("音声メモが空です");
      return;
    }
    // ponytail: navigator.onLine は「リンクがあるか」だけを見る簡易判定で、
    // キャプティブポータルや死んだ上流回線は検知できない（その場合は下の fetch が
    // 通常のネットワークエラーとして落ちる）。実接続確認が要るなら疎通用エンドポイントへの
    // 事前 fetch に上げる。
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setError("オフラインのため AI 整形を実行できません。接続を確認してください。");
      return;
    }
    setGenerating(true);
    setError(null);
    try {
      const endpoint = isNote ? "/api/admin/voice-note" : "/api/admin/certificates/voice-memo";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript: finalTranscript,
          service_type: serviceType,
          vehicle_hint: vehicleHint,
          customer_hint: customerHint,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "整形に失敗しました");
      if (props.variant === "note") {
        if (typeof data.note !== "string" || !data.note) {
          throw new Error("AI が応答しませんでした (再試行してください)");
        }
        props.onApply(data.note);
      } else {
        if (!data.draft) throw new Error("AI が応答しませんでした (再試行してください)");
        props.onApply(data.draft);
      }
      setApplied(true);
      setTimeout(() => setApplied(false), 3000);
    } catch (e: any) {
      setError(e.message ?? "エラーが発生しました");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="rounded-xl border border-border-default bg-surface">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-4 py-3 text-left text-sm font-medium hover:opacity-80 rounded-xl transition-opacity"
      >
        <span className="text-base">🎤</span>
        <span className="text-secondary">{isNote ? "音声メモから備考を生成" : "音声メモから施工内容を生成"}</span>
        <span className="ml-auto text-muted text-xs">{open ? "▲ 閉じる" : "▼ 開く"}</span>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3 border-t border-border-subtle">
          <p className="text-xs text-muted mt-3">
            {isNote
              ? "マイクで作業内容を喋ると AI が備考メモに整形します。記入内容は後から編集できます。"
              : "マイクで施工内容を喋ると AI が証明書ドラフトに整形します。記入内容は後から編集できます。"}
          </p>

          {!supported && (
            <div className="rounded-lg border border-warning/30 bg-warning-dim px-3 py-2 text-xs text-warning">
              このブラウザは音声入力に対応していません。下のテキストボックスに入力するか、Chrome / Safari
              でお試しください。
            </div>
          )}

          {/* マイクボタン */}
          <div className="flex items-center gap-3">
            {!recording ? (
              <button
                type="button"
                onClick={startRecording}
                disabled={!supported}
                className="flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-50"
              >
                🎤 録音開始
              </button>
            ) : (
              <button
                type="button"
                onClick={stopRecording}
                className="flex items-center gap-2 rounded-xl bg-red-500 px-4 py-2 text-sm font-medium text-white hover:bg-red-600 animate-pulse"
              >
                ⏹ 録音停止
              </button>
            )}
            {recording && <span className="text-xs text-red-500">● 録音中…</span>}
          </div>

          {/* 書き起こしテキスト (編集可能) */}
          <textarea
            value={transcript + (interim ? ` ${interim}` : "")}
            onChange={(e) => {
              setTranscript(e.target.value);
              setInterim("");
            }}
            rows={4}
            placeholder="ここに書き起こしが表示されます。手入力でも OK です。"
            className="w-full rounded-xl border border-border-default bg-surface px-3 py-2.5 text-sm text-primary placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
          />

          {/* 生成ボタン */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={generate}
              disabled={generating || !transcript.trim()}
              className="flex items-center gap-2 rounded-xl border border-border-default bg-surface px-4 py-2 text-sm font-medium text-secondary hover:bg-surface-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {generating ? (
                <>
                  <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-secondary border-t-transparent" />
                  生成中…
                </>
              ) : (
                <>✨ AI 整形して適用</>
              )}
            </button>
            <button
              type="button"
              onClick={() => {
                setTranscript("");
                setInterim("");
                setError(null);
              }}
              className="text-xs text-muted hover:text-secondary"
            >
              クリア
            </button>
          </div>

          {applied && (
            <div className="rounded-lg border border-success/30 bg-success-dim px-3 py-2 text-xs text-success-text">
              {isNote
                ? "✅ 備考欄に追記しました。内容を確認・編集してください。"
                : "✅ ドラフトをフォームに適用しました。内容を確認・編集してください。"}
            </div>
          )}
          {error && (
            <div className="rounded-lg border border-red-400/30 bg-red-400/10 px-3 py-2 text-xs text-red-400">
              {error}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
