export default async function BillingPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const status = Array.isArray(sp.status) ? sp.status[0] : sp.status;
  const msg =
    status === "success" ? "決済が完了しました。反映まで数秒かかる場合があります。" :
    status === "cancel" ? "決済がキャンセルされました。" :
    "請求情報ページです。";

  return (
    <main style={{ padding: 24, maxWidth: 720 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700 }}>Billing</h1>
      <p style={{ marginTop: 12 }}>{msg}</p>

      <div style={{ marginTop: 16, display: "flex", gap: 12, flexWrap: "wrap" }}>
        <a href="/admin" style={{ padding: "10px 14px", border: "1px solid #ddd", borderRadius: 10, textDecoration: "none" }}>
          管理画面へ戻る
        </a>
        {/* Portal への導線は後で（tenant_id取得して /api/stripe/portal を叩く） */}
      </div>

      <p style={{ marginTop: 24, opacity: 0.7, fontSize: 12 }}>
        ※この画面は Stripe Checkout の success_url / cancel_url の戻り先です。
      </p>
    </main>
  );
}
