-- certificate_versions — 確定後訂正の「不変スナップショット」台帳（②version-forward の Phase 1 基盤）
--
-- 目的:
--   証明書の内容を編集(訂正)したとき、その時点の内容を丸ごと不変スナップショットとして
--   追記する。既存の in-place 更新(certificates 行)・certificate_edit_histories(差分ログ)・
--   再アンカは維持したまま、「訂正が改ざん不能・追記専用・第三者検証可能な完全スナップショット
--   として残る」状態を作る。これは選択肢②の第一段階であり、リーダー(公開検証/PDF/表示 等
--   ~106 箇所)には一切触れないため非破壊。
--
--   Phase 2(全リーダーを resolveCertificateContent 経由に移行)→ Phase 3(certificates 内容列の
--   凍結トリガ + dual-write 停止) は本ファイルの後続。フリーズは全リーダー移行後にのみ入れる。
--
-- 不変性 vs 削除権(crypto-shredding):
--   本テーブルは顧客名・車両情報等の PII を含む完全スナップショットを保持する。したがって
--   docs/anchoring-roadmap.md の「削除＝crypto-shredding(物理削除で PII を消し、オンチェーンの
--   PII フリーなハッシュのみ残す)」と両立させるため、
--     - UPDATE は常時禁止(不変) … トリガで service-role も含めて拒否
--     - DELETE は許可 … certificates 削除時の ON DELETE CASCADE(＝消去権)を通すため
--   とする。改ざん検知は content_hash(PII フリーな 64hex)を証拠として担保する。

create table if not exists certificate_versions (
  id                 uuid primary key default gen_random_uuid(),
  certificate_id     uuid not null references certificates(id) on delete cascade,
  tenant_id          uuid not null references tenants(id) on delete cascade,
  -- certificates.current_version に対応する版番号(certificate_id 内で一意)
  version            integer not null,
  -- 訂正時点の内容フィールドの完全スナップショット(PII を含む)
  content            jsonb not null,
  -- content の canonical JSON(RFC8785 サブセット)を SHA-256 した 64hex。
  -- アプリ層(src/lib/certificates/certificateVersion.ts)で計算する。
  content_hash       text not null,
  hash_alg           text not null default 'SHA-256',
  -- 'initial'(原本) / 'edit'(訂正) 等。将来の訂正理由記録にも使う。
  change_reason      text,
  created_by         uuid references auth.users(id),
  -- クライアント申告時刻
  created_at         timestamptz not null default now(),
  -- DB 受信時刻(権威)。申告時刻と分離して保持する。
  server_received_at timestamptz not null default clock_timestamp(),
  unique (certificate_id, version)
);

create index if not exists certificate_versions_cert_version_idx
  on certificate_versions (certificate_id, version desc);
create index if not exists certificate_versions_tenant_idx
  on certificate_versions (tenant_id);
create index if not exists certificate_versions_content_hash_idx
  on certificate_versions (content_hash);

-- certificates 側から「現在の版」を指すショートカット(非内容列。将来フリーズ後も更新可)。
alter table certificates
  add column if not exists current_version_id uuid references certificate_versions(id) on delete set null;

-- ─────────────────────────────────────────────────────────────────────────────
-- 不変ガード: UPDATE は常時拒否(service-role も例外にしない)。DELETE は許可(消去権 CASCADE 用)。
--   part_installations_guard.sql の SECURITY DEFINER + SET search_path='' パターンに倣う。
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.certificate_versions_no_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception
    'certificate_versions: 版スナップショットは不変です。更新できません (id=%)', OLD.id;
end;
$$;

drop trigger if exists trg_certificate_versions_no_update on certificate_versions;
create trigger trg_certificate_versions_no_update
  before update on certificate_versions
  for each row execute function public.certificate_versions_no_update();

-- RLS: 自テナントのみ参照可。書込はサービスロール(API の tenant-scoped admin)経由のみ。
alter table certificate_versions enable row level security;

create policy "cert_versions_tenant_select"
  on certificate_versions for select
  using (tenant_id in (select tenant_id from tenant_memberships where user_id = auth.uid()));

create policy "cert_versions_service_insert"
  on certificate_versions for insert
  with check (auth.role() = 'service_role');
