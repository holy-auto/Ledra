-- 4/4: 20260924133000 で NOT VALID として足した CHECK を検証する。
ALTER TABLE public.insurer_users
  VALIDATE CONSTRAINT insurer_users_system_actor_shape_check;
