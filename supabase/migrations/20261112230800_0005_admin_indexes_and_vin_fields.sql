/*
# FleetGuard Migration 0005: Super Admin Panel, Vehicle/Carrier Metadata, Clear Sample Data,
# Concurrent Session Validation, and High-Performance Indexes

1. Super Admin Activation (`erorx72@gmail.com` only):
   - `is_super_admin()` checking `lower(auth.jwt()->>'email') = 'erorx72@gmail.com'`
   - RLS SELECT grants for `erorx72@gmail.com` on `subscriptions`, `companies`, `profiles`
   - `admin_search_accounts(_query text)` and `admin_activate_subscription(_target_user_id uuid, _plan text, _days int)`
2. Vehicle NHTSA & Carrier FMCSA Metadata + Clear Sample Data:
   - `vehicles`: `year`, `make`, `model`
   - `companies`: `dba_name`, `physical_address`, `carrier_status`, `sample_cleared`
   - `clear_sample_data(_company uuid)`: one-time cleanup of initial sample fleet rows
3. Concurrent Session Enforcement (`max 2 distinct devices`):
   - `upsert_user_session` reuses matching device_fingerprint or evicts oldest session if >2 active
   - `check_session_valid(_session_id uuid)` lets clients verify active session state
4. Performance Indexes:
   - Explicit indexes on `company_id`, `user_id`, `dot_number`, and `expires_on`
*/

-- =====================================================
-- 1. CARRIER & VEHICLE AUTO-FILL METADATA COLUMNS
-- =====================================================
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS dba_name text,
  ADD COLUMN IF NOT EXISTS physical_address text,
  ADD COLUMN IF NOT EXISTS carrier_status text,
  ADD COLUMN IF NOT EXISTS sample_cleared boolean NOT NULL DEFAULT false;

ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS year int,
  ADD COLUMN IF NOT EXISTS make text,
  ADD COLUMN IF NOT EXISTS model text;

-- =====================================================
-- 2. SUPER ADMIN HELPERS & RLS (erorx72@gmail.com ONLY)
-- =====================================================
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT lower(coalesce(auth.jwt()->>'email', '')) = 'erorx72@gmail.com'
$$;
REVOKE ALL ON FUNCTION public.is_super_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated, service_role;

-- Update tamper guard so ONLY service_role OR super-admin RPC context may activate subscriptions
CREATE OR REPLACE FUNCTION public.protect_subscriptions_tampering()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT public.is_service_or_admin()
       AND NOT (public.is_super_admin() AND current_setting('fleetguard.admin_rpc', true) = '1')
       AND NOT (NEW.plan = 'starter' AND NEW.status = 'trial' AND NEW.paid_at IS NULL) THEN
      RAISE EXCEPTION 'Only administrators can create paid or elevated subscriptions.';
    END IF;
    RETURN NEW;
  END IF;

  IF NOT public.is_service_or_admin()
     AND NOT (public.is_super_admin() AND current_setting('fleetguard.admin_rpc', true) = '1') THEN
    RAISE EXCEPTION 'Only administrators can modify subscription status, plan tier, or billing timestamps.';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'subscriptions.created_at is immutable.';
    END IF;
    NEW.updated_at := now();
  END IF;

  RETURN NEW;
END $$;

DROP POLICY IF EXISTS "Super admin reads all subscriptions" ON public.subscriptions;
CREATE POLICY "Super admin reads all subscriptions"
  ON public.subscriptions
  FOR SELECT
  TO authenticated
  USING (public.is_super_admin());

DROP POLICY IF EXISTS "Super admin reads all profiles" ON public.profiles;
CREATE POLICY "Super admin reads all profiles"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (public.is_super_admin());

DROP POLICY IF EXISTS "Super admin reads all companies" ON public.companies;
CREATE POLICY "Super admin reads all companies"
  ON public.companies
  FOR SELECT
  TO authenticated
  USING (public.is_super_admin());

CREATE OR REPLACE FUNCTION public.admin_search_accounts(_query text DEFAULT '')
RETURNS TABLE (
  user_id uuid,
  email text,
  full_name text,
  user_created_at timestamptz,
  plan text,
  status text,
  trial_expires_at timestamptz,
  billing_cycle_start timestamptz,
  billing_cycle_end timestamptz,
  paid_at timestamptz,
  company_id uuid,
  company_name text,
  dot_number text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  q text := lower(trim(coalesce(_query, '')));
  q_dot text := lower(coalesce(public.normalize_dot_number(coalesce(_query, '')), ''));
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Super Admin access required.';
  END IF;

  RETURN QUERY
  SELECT
    p.id AS user_id,
    p.email,
    p.full_name,
    p.created_at AS user_created_at,
    coalesce(s.plan, 'starter') AS plan,
    coalesce(s.status, 'trial') AS status,
    coalesce(s.trial_expires_at, p.created_at + interval '72 hours') AS trial_expires_at,
    s.billing_cycle_start,
    s.billing_cycle_end,
    s.paid_at,
    c.id AS company_id,
    c.name AS company_name,
    c.dot_number
  FROM public.profiles p
  LEFT JOIN public.subscriptions s ON s.user_id = p.id
  LEFT JOIN LATERAL (
    SELECT id, name, dot_number
    FROM public.companies comp
    WHERE comp.owner_id = p.id
    ORDER BY comp.created_at ASC
    LIMIT 1
  ) c ON true
  WHERE q = ''
    OR lower(coalesce(p.email, '')) LIKE '%' || q || '%'
    OR lower(coalesce(p.full_name, '')) LIKE '%' || q || '%'
    OR lower(coalesce(c.name, '')) LIKE '%' || q || '%'
    OR lower(coalesce(c.dot_number, '')) LIKE '%' || q || '%'
    OR (q_dot <> '' AND lower(coalesce(public.normalize_dot_number(c.dot_number), '')) LIKE '%' || q_dot || '%')
  ORDER BY p.created_at DESC
  LIMIT 100;
END $$;
REVOKE ALL ON FUNCTION public.admin_search_accounts(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_search_accounts(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_activate_subscription(
  _target_user_id uuid,
  _plan text,
  _days int DEFAULT 30
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_created timestamptz;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Super Admin access required.';
  END IF;

  IF _plan NOT IN ('starter', 'platinum', 'diamond') THEN
    RAISE EXCEPTION 'Invalid plan tier: %', _plan;
  END IF;

  IF _days IS NULL OR _days < 1 OR _days > 3650 THEN
    RAISE EXCEPTION 'Invalid activation duration';
  END IF;

  SELECT created_at INTO user_created FROM auth.users WHERE id = _target_user_id;
  IF user_created IS NULL THEN
    SELECT created_at INTO user_created FROM public.profiles WHERE id = _target_user_id;
  END IF;
  IF user_created IS NULL THEN
    RAISE EXCEPTION 'Registered user not found.';
  END IF;

  PERFORM set_config('fleetguard.admin_rpc', '1', true);

  INSERT INTO public.subscriptions (
    user_id,
    plan,
    status,
    trial_started_at,
    trial_expires_at,
    paid_at,
    billing_cycle_start,
    billing_cycle_end,
    updated_at
  )
  VALUES (
    _target_user_id,
    _plan,
    'active',
    user_created,
    user_created + interval '72 hours',
    now(),
    now(),
    now() + (_days || ' days')::interval,
    now()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    plan = EXCLUDED.plan,
    status = 'active',
    paid_at = now(),
    billing_cycle_start = now(),
    billing_cycle_end = now() + (_days || ' days')::interval,
    updated_at = now();

  UPDATE public.companies
  SET tier = _plan
  WHERE owner_id = _target_user_id;

  PERFORM set_config('fleetguard.admin_rpc', '0', true);
END $$;
REVOKE ALL ON FUNCTION public.admin_activate_subscription(uuid, text, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_activate_subscription(uuid, text, int) TO authenticated;

-- =====================================================
-- 3. ONE-TIME CLEAR SAMPLE DATA RPC
-- =====================================================
CREATE OR REPLACE FUNCTION public.clear_sample_data(_company uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  comp public.companies%ROWTYPE;
  removed_sample_vehicles int := 0;
  cycle_start timestamptz;
BEGIN
  SELECT * INTO comp FROM public.companies WHERE id = _company FOR UPDATE;
  IF NOT FOUND OR comp.owner_id <> auth.uid() THEN
    RAISE EXCEPTION 'Only the company owner can clear sample data.';
  END IF;

  -- Delete only untouched sample drivers seeded by _seed_sample_fleet
  DELETE FROM public.drivers
  WHERE company_id = _company
    AND full_name IN ('Marcus Johnson', 'Sarah Mitchell', 'David Rodriguez')
    AND coalesce(email, '') LIKE '%@example.com';

  -- Delete only untouched sample trucks seeded by _seed_sample_fleet
  WITH deleted_sample AS (
    DELETE FROM public.vehicles
    WHERE company_id = _company
      AND vin IN ('1FUJGLDR5CLBP8834', '3AKJHHDR7LSLA4421')
    RETURNING id
  )
  SELECT count(*)::int INTO removed_sample_vehicles FROM deleted_sample;

  -- One-time quota adjustment ONLY for the removed seeded demo units if never cleared before
  IF NOT comp.sample_cleared AND removed_sample_vehicles > 0 THEN
    SELECT coalesce(billing_cycle_start, date_trunc('month', now()))
    INTO cycle_start
    FROM public.subscriptions
    WHERE user_id = comp.owner_id;

    IF cycle_start IS NOT NULL THEN
      PERFORM set_config('fleetguard.sample_clear_rpc', '1', true);
      UPDATE public.truck_quota_counters
      SET trucks_created = GREATEST(0, trucks_created - removed_sample_vehicles),
          updated_at = now()
      WHERE owner_id = comp.owner_id
        AND billing_cycle_start = cycle_start;
      PERFORM set_config('fleetguard.sample_clear_rpc', '0', true);
    END IF;
  END IF;

  -- Mark sample_cleared directly via SQL if caller already has dot_number or prior to lock
  IF NOT comp.sample_cleared THEN
    UPDATE public.companies
    SET sample_cleared = true
    WHERE id = _company
      AND sample_cleared = false;
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.clear_sample_data(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.clear_sample_data(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.protect_truck_quota_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' AND NOT public.is_service_or_admin() THEN
    RAISE EXCEPTION 'Truck creation quota history cannot be deleted or reset.';
  END IF;

  IF TG_OP = 'UPDATE' AND TG_TABLE_NAME = 'truck_quota_counters' THEN
    IF NEW.trucks_created < OLD.trucks_created
       AND NOT public.is_service_or_admin()
       AND NOT (
         current_setting('fleetguard.sample_clear_rpc', true) = '1'
         AND (OLD.trucks_created - NEW.trucks_created) <= 2
         AND EXISTS (
           SELECT 1 FROM public.companies c
           WHERE c.owner_id = OLD.owner_id AND c.sample_cleared = false
         )
       ) THEN
      RAISE EXCEPTION 'Truck creation quota cannot be decremented.';
    END IF;
    NEW.updated_at := now();
  ELSIF TG_OP = 'UPDATE' AND TG_TABLE_NAME = 'truck_creation_log' AND NOT public.is_service_or_admin() THEN
    RAISE EXCEPTION 'Truck creation log is append-only.';
  END IF;

  RETURN NEW;
END $$;

-- Allow protect_company_tier_and_dot_lock to pass clear_sample_data and Super Admin RPC updates
CREATE OR REPLACE FUNCTION public.protect_company_tier_and_dot_lock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sub public.subscriptions%ROWTYPE;
  effective_plan text := 'starter';
  caller_uid uuid := auth.uid();
  is_privileged boolean := public.is_service_or_admin()
    OR (public.is_super_admin() AND current_setting('fleetguard.admin_rpc', true) = '1');
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT * INTO sub FROM public.subscriptions WHERE user_id = NEW.owner_id;
    effective_plan := coalesce(sub.plan, 'starter');

    IF NOT is_privileged THEN
      NEW.tier := effective_plan;
      NEW.created_at := now();
      NEW.trial_started_at := coalesce(sub.trial_started_at, now());
    END IF;
    RETURN NEW;
  END IF;

  SELECT * INTO sub FROM public.subscriptions WHERE user_id = OLD.owner_id;
  effective_plan := coalesce(sub.plan, 'starter');

  IF NOT is_privileged THEN
    IF caller_uid IS DISTINCT FROM OLD.owner_id THEN
      RAISE EXCEPTION 'Only the company owner can modify or delete a company.';
    END IF;

    IF TG_OP = 'DELETE' THEN
      IF effective_plan IN ('starter', 'platinum') THEN
        RAISE EXCEPTION 'Starter and Platinum plans are locked to 1 DOT company and cannot delete or swap companies. Upgrade to Diamond Agency Plan.';
      END IF;
      RETURN OLD;
    END IF;

    -- Allow one-time internal sample_cleared flag update when no other columns change
    IF NEW.sample_cleared = true
       AND OLD.sample_cleared = false
       AND NEW.name IS NOT DISTINCT FROM OLD.name
       AND NEW.dot_number IS NOT DISTINCT FROM OLD.dot_number
       AND NEW.type IS NOT DISTINCT FROM OLD.type
       AND NEW.dba_name IS NOT DISTINCT FROM OLD.dba_name
       AND NEW.physical_address IS NOT DISTINCT FROM OLD.physical_address
       AND NEW.carrier_status IS NOT DISTINCT FROM OLD.carrier_status
       AND NEW.tier IS NOT DISTINCT FROM OLD.tier THEN
      RETURN NEW;
    END IF;

    IF NEW.tier IS DISTINCT FROM OLD.tier THEN
      RAISE EXCEPTION 'companies.tier is controlled by billing and cannot be edited by users.';
    END IF;
    IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'companies.created_at is immutable.';
    END IF;
    IF NEW.trial_started_at IS DISTINCT FROM OLD.trial_started_at THEN
      RAISE EXCEPTION 'companies.trial_started_at is immutable.';
    END IF;
    IF NEW.owner_id IS DISTINCT FROM OLD.owner_id THEN
      RAISE EXCEPTION 'companies.owner_id cannot be reassigned.';
    END IF;

    IF effective_plan IN ('starter', 'platinum')
       AND public.normalize_dot_number(coalesce(OLD.dot_number, '')) IS NOT NULL THEN
      RAISE EXCEPTION 'DOT company record is locked on % plan and cannot be updated or swapped.', upper(effective_plan);
    END IF;
  END IF;

  RETURN NEW;
END $$;

-- =====================================================
-- 4. CONCURRENT SESSION ENFORCEMENT (MAX 2 DEVICES)
-- =====================================================
CREATE OR REPLACE FUNCTION public.upsert_user_session(
  _device_fingerprint text,
  _ip_address text,
  _ip_geo text DEFAULT NULL,
  _user_agent text DEFAULT NULL
)
RETURNS TABLE (
  session_id uuid,
  is_terminated boolean,
  impossible_travel_detected boolean,
  max_sessions_exceeded boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  existing_sess uuid;
  active_count int;
  oldest_session uuid;
  detected boolean := false;
  exceeded boolean := false;
  last_geo text;
  last_time timestamptz;
  time_diff_hours numeric;
  new_sess uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  -- Reuse existing active session if this exact browser device fingerprint is already active
  SELECT id INTO existing_sess
  FROM public.user_sessions
  WHERE user_id = uid
    AND device_fingerprint = _device_fingerprint
    AND is_terminated = false
  ORDER BY last_active_at DESC
  LIMIT 1;

  IF existing_sess IS NOT NULL THEN
    UPDATE public.user_sessions
    SET last_active_at = now(),
        ip_address = _ip_address,
        ip_geo = coalesce(_ip_geo, ip_geo),
        user_agent = coalesce(_user_agent, user_agent)
    WHERE id = existing_sess;

    RETURN QUERY SELECT existing_sess, false, false, false;
    RETURN;
  END IF;

  -- Count distinct active sessions; keep at most 2 concurrent devices
  SELECT count(*)::int INTO active_count
  FROM public.user_sessions
  WHERE user_id = uid AND is_terminated = false;

  WHILE active_count >= 2 LOOP
    exceeded := true;
    SELECT id INTO oldest_session
    FROM public.user_sessions
    WHERE user_id = uid AND is_terminated = false
    ORDER BY last_active_at ASC
    LIMIT 1;

    EXIT WHEN oldest_session IS NULL;
    UPDATE public.user_sessions SET is_terminated = true WHERE id = oldest_session;
    active_count := active_count - 1;
  END LOOP;

  SELECT ip_geo, last_active_at INTO last_geo, last_time
  FROM public.user_sessions
  WHERE user_id = uid AND is_terminated = false
  ORDER BY last_active_at DESC LIMIT 1;

  IF last_geo IS NOT NULL AND _ip_geo IS NOT NULL AND last_geo <> _ip_geo THEN
    time_diff_hours := EXTRACT(EPOCH FROM (now() - last_time)) / 3600;
    IF time_diff_hours < 4 THEN
      detected := true;
      UPDATE public.user_sessions SET is_terminated = true WHERE user_id = uid AND is_terminated = false;
    END IF;
  END IF;

  INSERT INTO public.user_sessions (user_id, session_token, device_fingerprint, ip_address, ip_geo, user_agent)
  VALUES (uid, gen_random_uuid()::text, _device_fingerprint, _ip_address, _ip_geo, _user_agent)
  RETURNING id INTO new_sess;

  RETURN QUERY SELECT new_sess, false, detected, exceeded;
END $$;
REVOKE ALL ON FUNCTION public.upsert_user_session(text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_user_session(text, text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.check_session_valid(_session_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_sessions
    WHERE id = _session_id
      AND user_id = auth.uid()
      AND is_terminated = false
  )
$$;
REVOKE ALL ON FUNCTION public.check_session_valid(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_session_valid(uuid) TO authenticated;

-- =====================================================
-- 5. ZERO-LAG POSTGRESQL INDEXES
-- =====================================================
CREATE INDEX IF NOT EXISTS companies_dot_number_idx
  ON public.companies(dot_number) WHERE dot_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS documents_expires_on_idx
  ON public.documents(expires_on) WHERE expires_on IS NOT NULL;

CREATE INDEX IF NOT EXISTS documents_company_expires_on_idx
  ON public.documents(company_id, expires_on);

CREATE INDEX IF NOT EXISTS company_members_company_id_idx
  ON public.company_members(company_id) WHERE company_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS truck_creation_log_company_id_idx
  ON public.truck_creation_log(company_id, billing_cycle_start);

CREATE INDEX IF NOT EXISTS truck_quota_counters_owner_id_idx
  ON public.truck_quota_counters(owner_id);
