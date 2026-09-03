import { after } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import { recordInvoicePaymentBalance } from "@/lib/invoice/recordPayment";
import { maybeAutoSendDocumentOnConfirm } from "@/lib/ai/automation/documentAuto";
import { sealDocumentOnFinalize, type SealableDocument } from "@/lib/documents/documentSeal";

/**
 * 帳票のステータス変更に伴う副作用 — 管理画面とモバイルで共有する。
 *
 * 確定 (draft→sent) は電帳法の封印・自動送付・見積フロー進行を伴う。
 * 呼び出し側ごとに書くと、片方だけ封印が漏れて「確定したのに真実性の担保が無い
 * 帳票」ができる。入口をここ 1 箇所にする。
 *
 * どちらも失敗してもレスポンスは成功のまま（ステータス更新は既にコミット済み）。
 * ただし実行のタイミングは異なる:
 *   - 入金記帳はレスポンス前に待つ。売掛の残高は同じリクエストの中で確定させる
 *   - 確定の副作用は after() でレスポンス後に回す。外部送信を含み時間がかかるうえ、
 *     fire-and-forget だと serverless インスタンスが凍結して途中で欠落しうる
 */

/** 帳票が「入金済」になったときに売掛元帳へ記帳する。請求書系のみ。 */
export async function recordPaymentOnPaid(
  admin: SupabaseClient,
  args: {
    tenantId: string;
    actorUserId: string;
    document: {
      id: string;
      doc_type: string;
      total: number | null;
      customer_id: string | null;
      payment_date: string | null;
    };
  },
): Promise<void> {
  const { document: doc } = args;
  if (doc.doc_type !== "invoice" && doc.doc_type !== "consolidated_invoice") return;

  try {
    await recordInvoicePaymentBalance(admin, {
      tenantId: args.tenantId,
      documentId: doc.id,
      total: Number(doc.total ?? 0),
      customerId: doc.customer_id ?? null,
      paymentMethod: "cash",
      paymentDate: doc.payment_date ?? new Date().toISOString().slice(0, 10),
      // 手動「入金済」更新は referenceNo が無く、連打で二重記帳し得る。
      // document + 金額で決まる安定キーを渡し、recordPayment 側の重複ガードに拾わせる。
      referenceNo: `manual:${doc.id}:${Math.round(Number(doc.total ?? 0))}`,
      recordedBy: args.actorUserId,
      notes: "請求書を入金済に更新 (自動記帳)",
    });
  } catch (ledgerErr) {
    console.error("documents: ledger entry failed (non-blocking)", ledgerErr);
  }
}

/**
 * 確定 (draft→sent) の副作用。
 *
 * after(): レスポンス送出後も serverless 実行を保証して送付を完走させる。
 * 素の fire-and-forget だと Vercel 等でインスタンスが凍結/終了し、claim 作成 /
 * Stripe セッション / 外部送信の途中で送付が欠落しうる。
 */
export function runDocumentFinalizeEffects(
  admin: SupabaseClient,
  args: {
    tenantId: string;
    actorUserId: string;
    baseUrl: string;
    document: SealableDocument & { id: string; doc_type: string; meta_json?: unknown };
  },
): void {
  const { document: doc } = args;
  const isEstimate = doc.doc_type === "estimate";

  after(async () => {
    // 電帳法「真実性の確保」: 確定した帳票に内容ハッシュ＋TS 封印を付ける（best-effort）。
    try {
      await sealDocumentOnFinalize(admin, args.tenantId, doc);
    } catch (sealErr) {
      console.error("documents: integrity seal failed (non-blocking)", sealErr);
    }
    try {
      await maybeAutoSendDocumentOnConfirm({
        tenantId: args.tenantId,
        documentId: doc.id,
        actorUserId: args.actorUserId,
        baseUrl: args.baseUrl,
      });
    } catch {
      // maybeAutoSendDocumentOnConfirm は内部で握り潰すが、二重で保護する。
    }
    // 見積書の送付なら、その見積りに紐づく会話フローを可否待ちへ進め、
    // 顧客に可否ボタンを送る (opt-in / 該当フロー無しは no-op / 内部で fail-soft)。
    if (isEstimate) {
      try {
        const { maybeAdvanceFlowOnQuoteSent } = await import("@/lib/ai/automation/conversationFlowPostback");
        await maybeAdvanceFlowOnQuoteSent({ tenantId: args.tenantId, documentId: doc.id });
      } catch {
        // fail-soft
      }
    }
  });
}
