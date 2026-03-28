-- New tables for insurer portal features
-- Notifications, user preferences, case templates, assignment rules,
-- SLA config, watchlist, security settings

-- 1. Notifications
CREATE TABLE IF NOT EXISTS insurer_notifications (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  insurer_id uuid NOT NULL REFERENCES insurers (id) ON DELETE CASCADE,
  user_id    uuid REFERENCES auth.users (id) ON DELETE CASCADE,
  type       text NOT NULL DEFAULT 'system',
  title      text NOT NULL,
  body       text,
  link       text,
  is_read    boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_insurer_notif_user ON insurer_notifications (insurer_id, user_id, is_read, created_at DESC);

-- 2. User notification preferences
CREATE TABLE IF NOT EXISTS insurer_user_preferences (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  insurer_id uuid NOT NULL REFERENCES insurers (id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  preferences jsonb NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (insurer_id, user_id)
);

-- 3. Custom case templates
CREATE TABLE IF NOT EXISTS insurer_case_templates (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  insurer_id           uuid NOT NULL REFERENCES insurers (id) ON DELETE CASCADE,
  name                 text NOT NULL,
  title_template       text NOT NULL DEFAULT '',
  category             text NOT NULL DEFAULT '',
  default_priority     text NOT NULL DEFAULT 'normal',
  description_template text NOT NULL DEFAULT '',
  created_by           uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_case_tmpl_insurer ON insurer_case_templates (insurer_id);

-- 4. Assignment rules
CREATE TABLE IF NOT EXISTS insurer_assignment_rules (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  insurer_id      uuid NOT NULL REFERENCES insurers (id) ON DELETE CASCADE,
  name            text NOT NULL DEFAULT '',
  condition_type  text NOT NULL,
  condition_value text NOT NULL DEFAULT '',
  assign_to       uuid NOT NULL REFERENCES insurer_users (id) ON DELETE CASCADE,
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_assign_rules_insurer ON insurer_assignment_rules (insurer_id, is_active);

-- 5. SLA config
CREATE TABLE IF NOT EXISTS insurer_sla_config (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  insurer_id   uuid NOT NULL REFERENCES insurers (id) ON DELETE CASCADE UNIQUE,
  urgent_hours integer NOT NULL DEFAULT 4,
  high_hours   integer NOT NULL DEFAULT 24,
  normal_hours integer NOT NULL DEFAULT 72,
  low_hours    integer NOT NULL DEFAULT 168,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  updated_by   uuid REFERENCES auth.users (id) ON DELETE SET NULL
);

-- 6. Watchlist
CREATE TABLE IF NOT EXISTS insurer_watchlist (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  insurer_id  uuid NOT NULL REFERENCES insurers (id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  target_type text NOT NULL,
  target_id   uuid NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, target_type, target_id)
);
CREATE INDEX IF NOT EXISTS idx_watchlist_user ON insurer_watchlist (insurer_id, user_id);

-- 7. Security settings
CREATE TABLE IF NOT EXISTS insurer_security_settings (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  insurer_id             uuid NOT NULL REFERENCES insurers (id) ON DELETE CASCADE UNIQUE,
  ip_whitelist_enabled   boolean NOT NULL DEFAULT false,
  ip_whitelist           text[] DEFAULT '{}',
  session_timeout_minutes integer NOT NULL DEFAULT 30,
  updated_at             timestamptz NOT NULL DEFAULT now(),
  updated_by             uuid REFERENCES auth.users (id) ON DELETE SET NULL
);

-- RLS policies (all tables use service_role via createAdminClient, so keep simple)
ALTER TABLE insurer_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE insurer_user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE insurer_case_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE insurer_assignment_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE insurer_sla_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE insurer_watchlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE insurer_security_settings ENABLE ROW LEVEL SECURITY;
