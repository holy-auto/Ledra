-- document_templates.doc_type の CHECK に 'staff_invoice' を追加。
-- DOC_TYPE_LIST（テンプレート編集画面の doc_type セレクト）は既に staff_invoice を
-- 含んでいるため、選択しても保存できない状態を解消する。
ALTER TABLE document_templates
  DROP CONSTRAINT IF EXISTS document_templates_doc_type_check;

ALTER TABLE document_templates
  ADD CONSTRAINT document_templates_doc_type_check
  CHECK (doc_type IS NULL OR doc_type IN (
    'estimate', 'delivery', 'purchase_order', 'order_confirmation',
    'inspection', 'receipt', 'invoice', 'consolidated_invoice', 'staff_invoice'
  ))
  NOT VALID;

ALTER TABLE document_templates
  VALIDATE CONSTRAINT document_templates_doc_type_check;
