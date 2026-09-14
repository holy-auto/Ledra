/**
 * POS の Stripe Checkout の戻り先。
 *
 * なぜ要るか: `/api/mobile/pos/checkout/qr-session` は success_url も cancel_url も
 * このパスを指しているのに、**ページが存在せず 404 になっていた**。従来は
 * お客様のスマホにだけ出ていたが、店の端末で決済ページを開けるようにしたので
 * 店員の目にも入る。
 *
 * 会計の成否はここでは判定しない。**店側の端末がポーリングして確定させる**ので、
 * ここが言えるのは「手続きは終わった、店の画面を見てください」だけ。
 * success と cancel で URL が同じ以上、ここで「完了しました」と断言すると嘘になる。
 */
export const dynamic = "force-static";

export const metadata = {
  title: "お手続きが完了しました | Ledra",
  robots: { index: false, follow: false },
};

export default function PosQrCompletePage() {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="text-5xl" aria-hidden>
        ✅
      </div>
      <h1 className="text-xl font-bold text-primary">お手続きが完了しました</h1>
      <p className="text-sm text-muted">
        店舗の画面で会計の完了をご確認ください。この画面は閉じていただいて構いません。
      </p>
      <p className="text-xs text-muted">決済が完了していない場合は、店舗スタッフにお声がけください。</p>
    </main>
  );
}
