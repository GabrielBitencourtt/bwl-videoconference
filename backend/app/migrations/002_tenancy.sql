-- Multi-tenant / licensing foundation.

-- Plans = base templates of limits (hybrid: tenant overrides take precedence).
CREATE TABLE IF NOT EXISTS plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  max_rooms INT NOT NULL DEFAULT -1,            -- -1 = unlimited
  max_participants INT NOT NULL DEFAULT 50,
  recording_enabled BOOLEAN NOT NULL DEFAULT true,
  storage_quota_gb INT NOT NULL DEFAULT 50,
  price_cents INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tenants = licenses (one per client). NULL override columns inherit from plan.
CREATE TABLE IF NOT EXISTS tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',         -- active | suspended | trial
  plan_id UUID REFERENCES plans(id),
  max_rooms INT,
  max_participants INT,
  recording_enabled BOOLEAN,
  storage_quota_gb INT,
  branding JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- API keys (the full key is shown once; only the hash is stored).
CREATE TABLE IF NOT EXISTS tenant_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT,
  key_prefix TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tenant_api_keys_tenant_idx ON tenant_api_keys(tenant_id);

-- Vendor admin users (the reseller's panel). Passwords are bcrypt-hashed.
CREATE TABLE IF NOT EXISTS admin_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT,
  role TEXT NOT NULL DEFAULT 'admin',            -- superadmin | admin | viewer
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at TIMESTAMPTZ
);

-- Scope rooms by tenant.
ALTER TABLE video_rooms ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS video_rooms_tenant_idx ON video_rooms(tenant_id);

-- Seed a default plan + default tenant (the existing app), then backfill rooms.
INSERT INTO plans (name, slug, max_rooms, max_participants, recording_enabled, storage_quota_gb, price_cents)
  VALUES ('Padrão', 'default', -1, 100, true, 100, 0)
  ON CONFLICT (slug) DO NOTHING;

INSERT INTO tenants (name, slug, status, plan_id)
  SELECT 'OpenPBL', 'openpbl', 'active', (SELECT id FROM plans WHERE slug='default')
  ON CONFLICT (slug) DO NOTHING;

UPDATE video_rooms
  SET tenant_id = (SELECT id FROM tenants WHERE slug='openpbl')
  WHERE tenant_id IS NULL;
