/**
 * /my/line?t=<token> — LINE から届いたログインリンクの確認画面。
 *
 * **この画面はトークンを消費しない。** ログインは「マイページを開く」ボタンの POST で
 * 初めて成立する。GET で消費すると、LINE のリンクプレビュー生成・セキュリティスキャナ・
 * メッセージクローラが URL を先読みしただけで単回使用のトークンが焼き切れ、実際に
 * タップしたお客様には「期限切れ」しか表示されなくなる (クローラは通常フォームを
 * 送信しないので、明示的な操作を挟むことで区別する)。
 */
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function LineLoginConfirmPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const raw = Array.isArray(sp?.t) ? sp?.t[0] : sp?.t;
  const token = (raw ?? "").trim();

  // 形が違うものはトークンを引くまでもなく通常ログインへ戻す。
  if (!/^[0-9a-f]{64}$/.test(token)) redirect("/my?reason=line_link_expired");

  return (
    <main className="mx-auto max-w-lg p-6 font-sans">
      <div className="rounded-3xl border border-border-default bg-surface p-6 shadow-sm">
        <div className="text-sm font-semibold text-accent">Ledra</div>
        <h1 className="mt-2 text-2xl font-bold text-primary">マイページを開く</h1>
        <p className="mt-2 text-sm leading-6 text-secondary">
          施工証明書・施工履歴・ご予約をご確認いただけます。下のボタンを押すとログインします。
        </p>

        <form method="post" action="/api/customer/line-login" className="mt-5">
          <input type="hidden" name="t" value={token} />
          <button
            type="submit"
            className="inline-flex w-full items-center justify-center rounded-2xl bg-accent px-4 py-3 text-sm font-semibold text-white hover:bg-accent/90"
          >
            マイページを開く
          </button>
        </form>

        <div className="mt-5 text-xs leading-6 text-muted">
          このリンクはお客様専用で、一度ログインすると使えなくなります。有効期限が切れた場合は、LINEのトークで「マイページ」と送っていただくと新しいリンクをお送りします。
        </div>
      </div>
    </main>
  );
}
