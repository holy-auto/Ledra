"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * 受領サイン完了画面に表示する顧客レビュー収集ウィジェット。
 *
 * - 5 段階の星評価 + 任意のコメント
 * - 4 星以上 + テナントが google_review_url を設定済なら、送信後に
 *   Google レビュー誘導ボタンを表示 (定石: 高評価のみ外部へ誘導)
 * - 二重送信は API 側の UNIQUE 制約で 409、UI は「投稿済み」表示にフォールバック
 * - tone は CompleteScreen の dark テーマに合わせる
 */

type Status = "idle" | "loading" | "submitting" | "submitted" | "already" | "error";

interface ContextResponse {
  tenant_name: string | null;
  google_review_url: string | null;
  already_reviewed: boolean;
  review: { rating: number; comment: string | null; google_redirected: boolean } | null;
  can_review: boolean;
}

export default function ReviewPrompt({ token }: { token: string }) {
  const [status, setStatus] = useState<Status>("loading");
  const [tenantName, setTenantName] = useState<string | null>(null);
  const [googleUrl, setGoogleUrl] = useState<string | null>(null);
  const [rating, setRating] = useState<number>(0);
  const [hover, setHover] = useState<number>(0);
  const [comment, setComment] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/signature/review/${encodeURIComponent(token)}`);
        if (!res.ok) {
          if (!cancelled) setStatus("idle");
          return;
        }
        const j = (await res.json()) as ContextResponse;
        if (cancelled) return;
        setTenantName(j.tenant_name ?? null);
        setGoogleUrl(j.google_review_url ?? null);
        if (j.already_reviewed) {
          setStatus("already");
          if (j.review) {
            setRating(j.review.rating);
            setComment(j.review.comment ?? "");
          }
        } else if (j.can_review) {
          setStatus("idle");
        } else {
          // 署名前 or キャンセル: 何も表示しない
          setStatus("error");
        }
      } catch {
        if (!cancelled) setStatus("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const submit = useCallback(async () => {
    if (rating < 1) return;
    setStatus("submitting");
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/signature/review/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating, comment: comment.trim() || undefined }),
      });
      const j = (await res.json().catch(() => null)) as { google_review_url?: string | null; message?: string } | null;
      if (res.status === 409) {
        setStatus("already");
        return;
      }
      if (!res.ok) {
        setStatus("error");
        setErrorMsg(j?.message ?? "送信に失敗しました。時間をおいて再度お試しください。");
        return;
      }
      // POST レスポンスの google_review_url を優先 (4 星以上のみ)
      if (j?.google_review_url) setGoogleUrl(j.google_review_url);
      setStatus("submitted");
    } catch (e) {
      setStatus("error");
      setErrorMsg(e instanceof Error ? e.message : String(e));
    }
  }, [token, rating, comment]);

  const recordGoogleRedirect = useCallback(async () => {
    // ベストエフォート: 高評価 → Google 遷移を記録 (失敗しても遷移は止めない)
    try {
      await fetch(`/api/signature/review/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating, comment: comment.trim() || undefined, google_redirected: true }),
      });
    } catch {
      // ignore
    }
  }, [token, rating, comment]);

  if (status === "loading" || status === "error") {
    // ロード中 or 取得不能はサイレント。完了画面の主要素ではないため。
    return null;
  }

  const offerGoogle = rating >= 4 && !!googleUrl && status === "submitted";

  return (
    <div className="mt-6 bg-gray-900 rounded-2xl border border-gray-800 p-5">
      <h2 className="text-white text-base font-semibold mb-1">
        {tenantName ? `${tenantName} のサービスはいかがでしたか？` : "サービスのご感想をお聞かせください"}
      </h2>
      <p className="text-gray-400 text-xs mb-4">
        {status === "already"
          ? "ご評価ありがとうございました。今後のサービス向上に活用いたします。"
          : "5 段階で評価してください。任意でコメントもいただけると励みになります。"}
      </p>

      {/* 星評価 */}
      <div className="flex items-center gap-1 mb-3" role="radiogroup" aria-label="星評価">
        {[1, 2, 3, 4, 5].map((n) => {
          const active = (hover || rating) >= n;
          const disabled = status === "submitting" || status === "submitted" || status === "already";
          return (
            <button
              type="button"
              key={n}
              role="radio"
              aria-checked={rating === n}
              aria-label={`${n} 星`}
              disabled={disabled}
              onMouseEnter={() => !disabled && setHover(n)}
              onMouseLeave={() => !disabled && setHover(0)}
              onClick={() => !disabled && setRating(n)}
              className={`text-3xl transition-transform ${disabled ? "" : "hover:scale-110"} ${
                active ? "text-yellow-400" : "text-gray-700"
              }`}
            >
              {active ? "★" : "☆"}
            </button>
          );
        })}
        {rating > 0 && <span className="ml-2 text-gray-300 text-sm">{rating} / 5</span>}
      </div>

      {(status === "idle" || status === "submitting") && rating > 0 && (
        <>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="施工内容・スタッフ対応・店内のご感想など (任意)"
            rows={3}
            maxLength={2000}
            disabled={status === "submitting"}
            className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 disabled:opacity-50"
          />
          <button
            type="button"
            onClick={submit}
            disabled={status === "submitting" || rating < 1}
            className="mt-3 w-full py-2.5 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-500 transition-colors disabled:opacity-50"
          >
            {status === "submitting" ? "送信中…" : "評価を送信"}
          </button>
        </>
      )}

      {status === "submitted" && (
        <p className="text-sm text-emerald-400 mb-3">✅ 評価を送信しました。ありがとうございます！</p>
      )}

      {offerGoogle && (
        <a
          href={googleUrl!}
          target="_blank"
          rel="noopener noreferrer"
          onClick={recordGoogleRedirect}
          className="block w-full text-center py-2.5 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-500 transition-colors"
        >
          🌟 Google レビューにも投稿する
        </a>
      )}

      {errorMsg && <p className="mt-2 text-xs text-red-400">{errorMsg}</p>}
    </div>
  );
}
