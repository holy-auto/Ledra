type Props = {
  phone?: string | null;
  email?: string | null;
  lineId?: string | null;
  note?: string | null;
};

export default function ShopContact({ phone, email, lineId, note }: Props) {
  const hasAny = !!(phone || email || lineId || note);
  if (!hasAny) return null;

  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
      <div className="mb-3">
        <div className="text-[10px] font-semibold tracking-[0.2em] text-neutral-400 uppercase">Shop Info</div>
        <div className="text-base font-bold text-neutral-900 mt-0.5">店舗連絡先</div>
      </div>

      <div className="space-y-2">
        {phone && (
          <div className="rounded-xl bg-neutral-50 p-3">
            <div className="text-[11px] font-semibold tracking-wide text-neutral-400 uppercase">電話番号</div>
            <a
              href={`tel:${phone.replace(/[^\d+]/g, "")}`}
              className="mt-0.5 text-sm font-medium text-blue-600 underline"
            >
              {phone}
            </a>
          </div>
        )}

        {email && (
          <div className="rounded-xl bg-neutral-50 p-3">
            <div className="text-[11px] font-semibold tracking-wide text-neutral-400 uppercase">メール</div>
            <a href={`mailto:${email}`} className="mt-0.5 text-sm font-medium text-blue-600 underline break-all">
              {email}
            </a>
          </div>
        )}

        {lineId && (
          <div className="rounded-xl bg-neutral-50 p-3">
            <div className="text-[11px] font-semibold tracking-wide text-neutral-400 uppercase">LINE</div>
            <div className="mt-0.5 text-sm font-medium text-neutral-900">{lineId}</div>
          </div>
        )}

        {note && (
          <div className="rounded-xl bg-neutral-50 p-3">
            <div className="text-[11px] font-semibold tracking-wide text-neutral-400 uppercase">備考</div>
            <div className="mt-0.5 text-sm text-neutral-700 whitespace-pre-wrap">{note}</div>
          </div>
        )}
      </div>
    </section>
  );
}
