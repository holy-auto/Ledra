-- 合算請求書を作った後、元の請求書と合算請求書の両方が未入金・売掛・督促に乗っていた（二重計上）。
-- アプリは作成時から元の請求書を取消扱いにする（src/lib/documents/consolidatedSupersede.ts）。
-- ここでは既に送付した合算請求書（下書き・取消以外）について、未入金の元請求書（下書きを含む）を同じ形に揃える。
-- 既存の下書きは放置されたものがありうる（揃えると実際に未入金の請求書が督促・売掛から消える）ので対象にしない。
-- 下書きは送付（帳票 PUT・共有送付・モバイル）の時点でアプリが揃える。
-- 元のステータスは meta_json.status_before_consolidation に残し、合算請求書を取消・削除すると戻る。
-- 納品書・入金済の請求書は触らない。同じ請求書が複数の合算請求書に入っている場合はどれか1件に紐づく。

update public.documents s
set status = 'cancelled',
    meta_json = coalesce(s.meta_json, '{}'::jsonb)
      || jsonb_build_object('consolidated_into', c.id::text, 'status_before_consolidation', s.status),
    updated_at = now()
from public.documents c
where c.doc_type = 'consolidated_invoice'
  and c.status not in ('draft', 'cancelled')
  and c.tenant_id = s.tenant_id
  and jsonb_typeof(c.meta_json -> 'source_document_ids') = 'array'
  and (c.meta_json -> 'source_document_ids') ? s.id::text
  and s.doc_type = 'invoice'
  and s.status in ('draft', 'sent', 'overdue')
  and not (coalesce(s.meta_json, '{}'::jsonb) ? 'consolidated_into');
