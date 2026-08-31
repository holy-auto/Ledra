import { verifySignatureAppRouter } from "@upstash/qstash/nextjs";

type QStashHandler = Parameters<typeof verifySignatureAppRouter>[0];
type VerifiedHandler = ReturnType<typeof verifySignatureAppRouter>;

/**
 * QStash の署名検証器をリクエスト時に生成する。
 *
 * SDK のラッパーをモジュール評価時に呼ぶと、署名鍵を注入しないローカル build が
 * ページ収集前に例外終了する。実リクエストでは鍵が無い場合も必ず fail closed にする。
 */
export function withQstashSignature(handler: QStashHandler) {
  const route: VerifiedHandler = async (...args) => {
    const currentSigningKey = process.env.QSTASH_CURRENT_SIGNING_KEY;
    const nextSigningKey = process.env.QSTASH_NEXT_SIGNING_KEY;

    if (!currentSigningKey || !nextSigningKey) {
      console.error("QStash signing keys are not configured");
      return Response.json({ ok: false, error: "service_unavailable" }, { status: 503 });
    }

    return verifySignatureAppRouter(handler, { currentSigningKey, nextSigningKey })(...args);
  };

  return route;
}
