-- Account lifecycle metadata and restrictive RLS for tables used only by the Express API.
-- Express uses pg with a privileged server-side database role; this migration does not grant API roles access.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS account_status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMPTZ;
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS deactivated_by INTEGER;

-- Repair nullable values if the column existed from a partial/manual rollout.
UPDATE public.users SET account_status = 'active' WHERE account_status IS NULL;
ALTER TABLE public.users ALTER COLUMN account_status SET DEFAULT 'active';
ALTER TABLE public.users ALTER COLUMN account_status SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.users'::regclass
      AND conname = 'users_account_status_check'
  ) THEN
    ALTER TABLE public.users
      ADD CONSTRAINT users_account_status_check
      CHECK (account_status IN ('active', 'disabled'));
  END IF;
END
$$;

COMMENT ON COLUMN public.users.account_status IS
  'Access-account lifecycle state: active or disabled; separate from the related people record.';
COMMENT ON COLUMN public.users.deactivated_at IS
  'Timestamp when access was disabled; NULL while active.';
COMMENT ON COLUMN public.users.deactivated_by IS
  'users.id of the actor that disabled this account when known; intentionally has no FK to avoid coupling lifecycle/audit records to the actor row.';

-- This table is currently created by the Express bootstrap after migrations.
-- Create the existing shape here so RLS can be applied before application startup.
CREATE TABLE IF NOT EXISTS public.especialidades (
  id SERIAL PRIMARY KEY,
  nome VARCHAR(255) NOT NULL,
  categoria VARCHAR(100) NOT NULL,
  codigo VARCHAR(50),
  nivel INT,
  ano INT,
  instituicao VARCHAR(255),
  imagem_url TEXT,
  requisitos JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- A restrictive false policy composes with permissive policies already present.
-- The deny applies only to Supabase's direct API roles, not to a separate backend role.
-- Express must connect as table owner/BYPASSRLS or an explicitly privileged backend role.
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'plannings',
    'planning_activities',
    'planning_menus',
    'especialidades'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM anon, authenticated', tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'deny_direct_api_roles', tbl);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false)',
      'deny_direct_api_roles', tbl
    );

    -- Preserve a canonical Supabase backend role when it exists; do not assume
    -- that every deployment defines this role or uses it for Express/pg.
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'allow_privileged_service_role', tbl);
      EXECUTE format(
        'CREATE POLICY %I ON public.%I AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true)',
        'allow_privileged_service_role', tbl
      );
    END IF;
  END LOOP;
END
$$;
