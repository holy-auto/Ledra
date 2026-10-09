-- 合算請求書を作った後、元の請求書と合算請求書の両方が未入金・売掛・督促に乗っていた（二重計上）。
-- アプリは作成時から元の請求書を取消扱いにする（src/lib/documents/consolidatedSupersede.ts）。
-- ここでは既に作られた合算請求書（取消以外）について、未入金の元請求書を同じ形に揃える。
-- 元のステータスは meta_json.status_before_consolidation に残し、合算請求書を取消・削除すると戻る。
-- 納品書・入金済の請求書は触らない。同じ請求書が複数の合算請求書に入っている場合はどれか1件に紐づく。

update public.documents s
set status = 'cancelled',
    meta_json = coalesce(s.meta_json, '{}'::jsonb)
      || jsonb_build_object('consolidated_into', c.id::text, 'status_before_consolidation', s.status),
    updated_at = now()
from public.documents c
where c.doc_type = 'consolidated_invoice'
  and c.status <> 'cancelled'
  and c.tenant_id = s.tenant_id
  and jsonb_typeof(c.meta_json -> 'source_document_ids') = 'array'
  and (c.meta_json -> 'source_document_ids') ? s.id::text
  and s.doc_type = 'invoice'
  and s.status in ('sent', 'overdue')
  and not (coalesce(s.meta_json, '{}'::jsonb) ? 'consolidated_into');
