-- 2/4: 保険会社あたりシステム行は1つだけ。
-- CONCURRENTLY はトランザクションの中で走れないので、この文だけを持つファイルにしている。
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS insurer_users_one_system_per_insurer
  ON public.insurer_users (insurer_id)
  WHERE is_system;
