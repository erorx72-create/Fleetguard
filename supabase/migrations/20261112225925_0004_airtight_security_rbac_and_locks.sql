/*
# FleetGuard Airtight Security, Tier Enforcement, Immutable Locks & RBAC

## Overview
Hardens Supabase tables, RLS policies, triggers, and indexes so REST API callers
cannot bypass subscription, tier, DOT anti-squatting, truck quota, VIN, or RBAC rules.

## Protections Implemented
1. Subscription Tamper Protection (`subscriptions`, `companies`, `profiles`)
   - Revokes INSERT/UPDATE/DELETE from authenticated/anon on `subscriptions`.
   - BEFORE triggers reject any non-service_role changes to billing status, plan tier,
     trial dates, or `created_at` columns across `subscriptions`, `companies`, and `profiles`.
2. Strict Database-Enforced Tier Limits
   - Starter ($99): max 10 trucks total, 1 DOT company.
   - Platinum ($299): max 30 trucks total, 1 DOT company.
   - Diamond Agency ($1,499): max 50 DOT companies, unlimited trucks.
3. Anti-Agency Bypass (Immutable DOT Lock)
   - For Starter & Platinum plans, once a company's `dot_number` is set (or for any
     DELETE on a Starter/Platinum company row), any UPDATE or DELETE targeting that
     company row or `dot_number` raises a database exception.
4. Anti-Data Flipping & Monthly Quota Lock
   - Adds `public.truck_quota_counters` (append/increment-only per owner & billing cycle).
   - Removes `ON DELETE CASCADE` from `truck_creation_log.vehicle_id` so deleting a
     truck row NEVER removes log records or decrements the billing-cycle quota.
5. Immutable VIN Lock
   - BEFORE UPDATE trigger on `public.vehicles` blocks ANY change to `vin` after insert
     (`NEW.vin IS DISTINCT FROM OLD.vin`) and prevents moving units between companies.
6. Global Unique DOT (Anti-Squatting)
   - Immutable `normalize_dot_number(text)` + global UNIQUE index across `public.companies`.
   - BEFORE trigger raises `'This DOT number is already registered under another account.'`.
   - Updates `handle_new_user()` so new signups without a custom DOT do not collide.
7. Role-Based Access Enforcement (RBAC)
   - Adds `public.company_members` with RLS & trigger enforcement:
     - Starter: blocks all sub-user / staff invitations.
     - Platinum: allows `safety_manager` strictly bound to the owner's single `company_id`;
       blocks invited staff from creating companies or modifying billing.
     - Diamond Agency: allows `agency_staff` / `safety_manager` scoped strictly to
       companies owned by that agency.
*/

-- =====================================================
-- HELPER: Service-Role / Admin Context Check
-- =====================================================
CREATE OR REPLACE FUNCTION public.is_service_or_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(auth.role(), '') = 'service_role'
    OR coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), '') = 'service_role'
    OR (
      coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), '') = ''
      AND auth.uid() IS NULL
      AND current_user IN ('postgres', 'supabase_admin', 'supabase_auth_admin', 'service_role')
    )
$$;
REVOKE ALL ON FUNCTION public.is_service_or_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_service_or_admin() TO authenticated, service_role;

-- =====================================================
-- 1. SUBSCRIPTION & CREATED_AT TAMPER PROTECTION
-- =====================================================
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.subscriptions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.subscriptions TO authenticated;
GRANT ALL ON public.subscriptions TO service_role;

DROP POLICY IF EXISTS "User inserts own subscription" ON public.subscriptions;
DROP POLICY IF EXISTS "User updates own subscription" ON public.subscriptions;
DROP POLICY IF EXISTS "Service role manages subscriptions" ON public.subscriptions;
CREATE POLICY "Service role manages subscriptions"
  ON public.subscriptions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.protect_subscriptions_tampering()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Only service_role/admin or internal default starter-trial bootstrap may insert
    IF NOT public.is_service_or_admin()
       AND NOT (NEW.plan = 'starter' AND NEW.status = 'trial' AND NEW.paid_at IS NULL) THEN
      RAISE EXCEPTION 'Only administrators can create paid or elevated subscriptions.';
    END IF;
    RETURN NEW;
  END IF;

  IF NOT public.is_service_or_admin() THEN
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

DROP TRIGGER IF EXISTS protect_subscriptions_tampering_trigger ON public.subscriptions;
CREATE TRIGGER protect_subscriptions_tampering_trigger
  BEFORE INSERT OR UPDATE OR DELETE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.protect_subscriptions_tampering();

-- Keep companies.tier synced when service_role updates subscriptions.plan
CREATE OR REPLACE FUNCTION public.sync_company_tier_from_subscription()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.companies
  SET tier = NEW.plan
  WHERE owner_id = NEW.user_id
    AND tier IS DISTINCT FROM NEW.plan;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS sync_company_tier_trigger ON public.subscriptions;
CREATE TRIGGER sync_company_tier_trigger
  AFTER INSERT OR UPDATE OF plan ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.sync_company_tier_from_subscription();

-- Protect profiles.created_at and profiles.id from tampering
CREATE OR REPLACE FUNCTION public.protect_profiles_tampering()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_service_or_admin() THEN
    IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'profiles.created_at is immutable.';
    END IF;
    IF NEW.id IS DISTINCT FROM OLD.id THEN
      RAISE EXCEPTION 'profiles.id is immutable.';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS protect_profiles_tampering_trigger ON public.profiles;
CREATE TRIGGER protect_profiles_tampering_trigger
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profiles_tampering();

-- Harden get_subscription_status so lock check respects auth.users.created_at + 72h
CREATE OR REPLACE FUNCTION public.get_subscription_status()
RETURNS TABLE (
  plan text,
  status text,
  trial_started_at timestamptz,
  trial_expires_at timestamptz,
  trial_hours_remaining numeric,
  is_trial_active boolean,
  is_locked boolean,
  days_since_creation int
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sub public.subscriptions%ROWTYPE;
  uid uuid := auth.uid();
  user_created timestamptz;
  effective_expiry timestamptz;
  is_paid boolean;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT created_at INTO user_created FROM auth.users WHERE id = uid;
  IF user_created IS NULL THEN user_created := now(); END IF;

  SELECT * INTO sub FROM public.subscriptions WHERE user_id = uid;

  IF NOT FOUND THEN
    INSERT INTO public.subscriptions (user_id, plan, status, trial_started_at, trial_expires_at)
    VALUES (uid, 'starter', 'trial', user_created, user_created + interval '72 hours')
    RETURNING * INTO sub;
  END IF;

  effective_expiry := LEAST(sub.trial_expires_at, user_created + interval '72 hours');
  is_paid := lower(coalesce(sub.status, '')) IN ('paid', 'active');

  RETURN QUERY SELECT
    sub.plan,
    sub.status,
    sub.trial_started_at,
    effective_expiry,
    CASE WHEN is_paid THEN 0::numeric
         ELSE GREATEST(0, EXTRACT(EPOCH FROM (effective_expiry - now())) / 3600)::numeric
    END AS trial_hours_remaining,
    (NOT is_paid AND now() <= effective_expiry) AS is_trial_active,
    (NOT is_paid AND now() > effective_expiry) AS is_locked,
    GREATEST(0, EXTRACT(DAY FROM (now() - user_created)))::int AS days_since_creation;
END $$;
REVOKE ALL ON FUNCTION public.get_subscription_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_subscription_status() TO authenticated;

-- =====================================================
-- 2 & 4. ANTI-DATA FLIPPING COUNTER TABLE + LOG HARDENING
-- =====================================================
CREATE TABLE IF NOT EXISTS public.truck_quota_counters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  billing_cycle_start timestamptz NOT NULL,
  trucks_created int NOT NULL DEFAULT 0 CHECK (trucks_created >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, billing_cycle_start)
);

CREATE INDEX IF NOT EXISTS truck_quota_counters_owner_cycle_idx
  ON public.truck_quota_counters(owner_id, billing_cycle_start);

REVOKE ALL ON TABLE public.truck_quota_counters FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.truck_quota_counters TO authenticated;
GRANT ALL ON TABLE public.truck_quota_counters TO service_role;

ALTER TABLE public.truck_quota_counters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owner reads own truck quota" ON public.truck_quota_counters;
CREATE POLICY "Owner reads own truck quota"
  ON public.truck_quota_counters
  FOR SELECT
  TO authenticated
  USING (owner_id = auth.uid());

-- Fix truck_creation_log so deleting a vehicle row NEVER cascade-deletes the log row
ALTER TABLE public.truck_creation_log
  ADD COLUMN IF NOT EXISTS owner_id uuid;

UPDATE public.truck_creation_log tcl
SET owner_id = c.owner_id
FROM public.companies c
WHERE tcl.company_id = c.id
  AND tcl.owner_id IS NULL;

ALTER TABLE public.truck_creation_log
  DROP CONSTRAINT IF EXISTS truck_creation_log_vehicle_id_fkey;

ALTER TABLE public.truck_creation_log
  DROP CONSTRAINT IF EXISTS truck_creation_log_company_id_fkey;

ALTER TABLE public.truck_creation_log
  ALTER COLUMN vehicle_id DROP NOT NULL;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.truck_creation_log FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.truck_creation_log TO authenticated;
GRANT ALL ON TABLE public.truck_creation_log TO service_role;

-- Backfill truck_quota_counters from existing vehicles/logs for current cycle
INSERT INTO public.truck_quota_counters (owner_id, billing_cycle_start, trucks_created)
SELECT
  c.owner_id,
  coalesce(s.billing_cycle_start, date_trunc('month', now())),
  GREATEST(
    count(DISTINCT v.id),
    count(DISTINCT CASE WHEN tcl.billing_cycle_start = coalesce(s.billing_cycle_start, date_trunc('month', now())) THEN tcl.id END)
  )::int
FROM public.companies c
LEFT JOIN public.subscriptions s ON s.user_id = c.owner_id
LEFT JOIN public.vehicles v ON v.company_id = c.id
LEFT JOIN public.truck_creation_log tcl ON tcl.company_id = c.id
GROUP BY c.owner_id, coalesce(s.billing_cycle_start, date_trunc('month', now()))
ON CONFLICT (owner_id, billing_cycle_start) DO UPDATE
SET trucks_created = GREATEST(public.truck_quota_counters.trucks_created, EXCLUDED.trucks_created),
    updated_at = now();

-- Prevent tampering or decrementing on quota/log tables
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
    IF NEW.trucks_created < OLD.trucks_created AND NOT public.is_service_or_admin() THEN
      RAISE EXCEPTION 'Truck creation quota cannot be decremented.';
    END IF;
    NEW.updated_at := now();
  ELSIF TG_OP = 'UPDATE' AND TG_TABLE_NAME = 'truck_creation_log' AND NOT public.is_service_or_admin() THEN
    RAISE EXCEPTION 'Truck creation log is append-only.';
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS protect_truck_quota_counters_trigger ON public.truck_quota_counters;
CREATE TRIGGER protect_truck_quota_counters_trigger
  BEFORE UPDATE OR DELETE ON public.truck_quota_counters
  FOR EACH ROW EXECUTE FUNCTION public.protect_truck_quota_history();

DROP TRIGGER IF EXISTS protect_truck_creation_log_trigger ON public.truck_creation_log;
CREATE TRIGGER protect_truck_creation_log_trigger
  BEFORE UPDATE OR DELETE ON public.truck_creation_log
  FOR EACH ROW EXECUTE FUNCTION public.protect_truck_quota_history();

-- Enforce strict tier & monthly quota limits on vehicle creation
CREATE OR REPLACE FUNCTION public.enforce_vehicle_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  comp public.companies%ROWTYPE;
  sub public.subscriptions%ROWTYPE;
  effective_plan text := 'starter';
  cycle_start timestamptz;
  max_allowed int;
  current_active int;
  quota_used int := 0;
BEGIN
  SELECT * INTO comp FROM public.companies WHERE id = NEW.company_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Company not found';
  END IF;

  SELECT * INTO sub FROM public.subscriptions WHERE user_id = comp.owner_id FOR UPDATE;
  IF FOUND THEN
    effective_plan := coalesce(sub.plan, 'starter');
    cycle_start := coalesce(sub.billing_cycle_start, date_trunc('month', now()));
  ELSE
    effective_plan := 'starter';
    cycle_start := date_trunc('month', now());
  END IF;

  IF effective_plan = 'diamond' THEN
    RETURN NEW;
  ELSIF effective_plan = 'platinum' THEN
    max_allowed := 30;
  ELSE
    max_allowed := 10;
  END IF;

  INSERT INTO public.truck_quota_counters (owner_id, billing_cycle_start, trucks_created)
  VALUES (comp.owner_id, cycle_start, 0)
  ON CONFLICT (owner_id, billing_cycle_start) DO NOTHING;

  SELECT trucks_created INTO quota_used
  FROM public.truck_quota_counters
  WHERE owner_id = comp.owner_id
    AND billing_cycle_start = cycle_start
  FOR UPDATE;

  SELECT count(*)::int INTO current_active
  FROM public.vehicles v
  JOIN public.companies c ON c.id = v.company_id
  WHERE c.owner_id = comp.owner_id;

  IF GREATEST(coalesce(quota_used, 0), coalesce(current_active, 0)) >= max_allowed THEN
    RAISE EXCEPTION 'Truck limit reached for % plan (max % trucks per billing cycle). Deleting trucks does not reset your quota.',
      upper(effective_plan), max_allowed;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS enforce_vehicle_limit_trigger ON public.vehicles;
CREATE TRIGGER enforce_vehicle_limit_trigger
  BEFORE INSERT ON public.vehicles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_vehicle_limit();

-- Record every truck creation atomically in both log and quota counter (never decremented on delete)
CREATE OR REPLACE FUNCTION public.record_truck_creation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
  cycle_start timestamptz;
BEGIN
  SELECT owner_id INTO v_owner FROM public.companies WHERE id = NEW.company_id;
  IF v_owner IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT coalesce(billing_cycle_start, date_trunc('month', now()))
  INTO cycle_start
  FROM public.subscriptions
  WHERE user_id = v_owner;

  IF cycle_start IS NULL THEN
    cycle_start := date_trunc('month', now());
  END IF;

  INSERT INTO public.truck_creation_log (owner_id, company_id, vehicle_id, billing_cycle_start)
  VALUES (v_owner, NEW.company_id, NEW.id, cycle_start);

  INSERT INTO public.truck_quota_counters (owner_id, billing_cycle_start, trucks_created)
  VALUES (v_owner, cycle_start, 1)
  ON CONFLICT (owner_id, billing_cycle_start) DO UPDATE
  SET trucks_created = public.truck_quota_counters.trucks_created + 1,
      updated_at = now();

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS record_truck_creation_trigger ON public.vehicles;
CREATE TRIGGER record_truck_creation_trigger
  AFTER INSERT ON public.vehicles
  FOR EACH ROW EXECUTE FUNCTION public.record_truck_creation();

-- =====================================================
-- 5. IMMUTABLE VIN LOCK
-- =====================================================
CREATE OR REPLACE FUNCTION public.normalize_and_lock_vin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.vin := nullif(upper(trim(coalesce(NEW.vin, ''))), '');
    RETURN NEW;
  END IF;

  -- TG_OP = 'UPDATE'
  NEW.vin := nullif(upper(trim(coalesce(NEW.vin, ''))), '');

  IF NEW.vin IS DISTINCT FROM OLD.vin THEN
    RAISE EXCEPTION 'VIN is 100%% immutable after unit creation and cannot be updated.';
  END IF;

  IF NEW.company_id IS DISTINCT FROM OLD.company_id AND NOT public.is_service_or_admin() THEN
    RAISE EXCEPTION 'Units cannot be transferred between companies.';
  END IF;

  IF NEW.created_at IS DISTINCT FROM OLD.created_at AND NOT public.is_service_or_admin() THEN
    RAISE EXCEPTION 'vehicles.created_at is immutable.';
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS prevent_vin_change ON public.vehicles;
CREATE TRIGGER prevent_vin_change
  BEFORE INSERT OR UPDATE ON public.vehicles
  FOR EACH ROW EXECUTE FUNCTION public.normalize_and_lock_vin();

-- =====================================================
-- 6. GLOBAL UNIQUE DOT NUMBER (ANTI-SQUATTING)
-- =====================================================
CREATE OR REPLACE FUNCTION public.normalize_dot_number(_dot text)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = public
AS $$
  SELECT nullif(
    regexp_replace(
      regexp_replace(upper(trim(_dot)), '[^A-Z0-9]', '', 'g'),
      '^(US)?DOT',
      ''
    ),
    ''
  )
$$;

-- Clean any duplicate seeded sample DOT numbers before adding strict unique index
WITH ranked_dots AS (
  SELECT
    id,
    public.normalize_dot_number(dot_number) AS norm_dot,
    row_number() OVER (
      PARTITION BY public.normalize_dot_number(dot_number)
      ORDER BY created_at ASC, id ASC
    ) AS rn
  FROM public.companies
  WHERE public.normalize_dot_number(dot_number) IS NOT NULL
)
UPDATE public.companies c
SET dot_number = NULL
FROM ranked_dots r
WHERE c.id = r.id
  AND r.rn > 1
  AND r.norm_dot = '3482915';

CREATE UNIQUE INDEX IF NOT EXISTS companies_dot_number_normalized_unique_idx
  ON public.companies (public.normalize_dot_number(dot_number))
  WHERE public.normalize_dot_number(dot_number) IS NOT NULL;

CREATE OR REPLACE FUNCTION public.check_dot_unique()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  norm_new text;
BEGIN
  IF NEW.dot_number IS NOT NULL THEN
    NEW.dot_number := nullif(trim(NEW.dot_number), '');
  END IF;

  norm_new := public.normalize_dot_number(coalesce(NEW.dot_number, ''));

  IF norm_new IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.companies c
      WHERE public.normalize_dot_number(coalesce(c.dot_number, '')) = norm_new
        AND c.id <> NEW.id
    ) THEN
      RAISE EXCEPTION 'This DOT number is already registered under another account.';
    END IF;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS enforce_dot_unique ON public.companies;
CREATE TRIGGER enforce_dot_unique
  BEFORE INSERT OR UPDATE OF dot_number ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.check_dot_unique();

-- Update signup trigger so default demo companies do not collide on a hardcoded DOT number
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cid uuid;
  requested_dot text;
BEGIN
  INSERT INTO public.profiles (id, full_name, email, created_at)
  VALUES (
    NEW.id,
    coalesce(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
    NEW.email,
    coalesce(NEW.created_at, now())
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.subscriptions (user_id, plan, status, trial_started_at, trial_expires_at)
  VALUES (
    NEW.id,
    'starter',
    'trial',
    coalesce(NEW.created_at, now()),
    coalesce(NEW.created_at, now()) + interval '72 hours'
  )
  ON CONFLICT (user_id) DO NOTHING;

  requested_dot := nullif(trim(coalesce(NEW.raw_user_meta_data->>'dot_number', '')), '');

  INSERT INTO public.companies (owner_id, name, dot_number, tier, trial_started_at)
  VALUES (
    NEW.id,
    coalesce(nullif(trim(NEW.raw_user_meta_data->>'company_name'), ''), 'Lone Star Freight Co.'),
    requested_dot,
    'starter',
    coalesce(NEW.created_at, now())
  )
  RETURNING id INTO cid;

  PERFORM public._seed_sample_fleet(cid);
  RETURN NEW;
END $$;

-- =====================================================
-- 3 & 2. ANTI-AGENCY BYPASS (IMMUTABLE DOT LOCK) & COMPANY LIMITS
-- =====================================================
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
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT * INTO sub FROM public.subscriptions WHERE user_id = NEW.owner_id;
    effective_plan := coalesce(sub.plan, 'starter');

    IF NOT public.is_service_or_admin() THEN
      NEW.tier := effective_plan;
      NEW.created_at := now();
      NEW.trial_started_at := coalesce(sub.trial_started_at, now());
    END IF;
    RETURN NEW;
  END IF;

  -- Resolve owner's real subscription plan
  SELECT * INTO sub FROM public.subscriptions WHERE user_id = OLD.owner_id;
  effective_plan := coalesce(sub.plan, 'starter');

  IF NOT public.is_service_or_admin() THEN
    -- Block staff/non-owners even if caller bypassed RLS somehow
    IF caller_uid IS DISTINCT FROM OLD.owner_id THEN
      RAISE EXCEPTION 'Only the company owner can modify or delete a company.';
    END IF;

    IF TG_OP = 'DELETE' THEN
      IF effective_plan IN ('starter', 'platinum') THEN
        RAISE EXCEPTION 'Starter and Platinum plans are locked to 1 DOT company and cannot delete or swap companies. Upgrade to Diamond Agency Plan.';
      END IF;
      RETURN OLD;
    END IF;

    -- TG_OP = 'UPDATE'
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

    -- Anti-Agency Bypass: Starter & Platinum lock the company row once dot_number exists
    IF effective_plan IN ('starter', 'platinum')
       AND public.normalize_dot_number(coalesce(OLD.dot_number, '')) IS NOT NULL THEN
      RAISE EXCEPTION 'DOT company record is locked on % plan and cannot be updated or swapped.', upper(effective_plan);
    END IF;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS protect_company_tier_and_dot_lock_trigger ON public.companies;
CREATE TRIGGER protect_company_tier_and_dot_lock_trigger
  BEFORE INSERT OR UPDATE OR DELETE ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.protect_company_tier_and_dot_lock();

-- =====================================================
-- 7. ROLE-BASED ACCESS ENFORCEMENT (RBAC)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.company_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  member_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  email text NOT NULL,
  full_name text NOT NULL,
  role text NOT NULL CHECK (role IN ('safety_manager', 'agency_staff')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('pending', 'active', 'revoked')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS company_members_unique_assignment_idx
  ON public.company_members (
    owner_id,
    lower(email),
    coalesce(company_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

CREATE INDEX IF NOT EXISTS company_members_lookup_idx
  ON public.company_members(owner_id, company_id, member_user_id, status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_members TO authenticated;
GRANT ALL ON public.company_members TO service_role;
ALTER TABLE public.company_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners and members read memberships" ON public.company_members;
CREATE POLICY "Owners and members read memberships"
  ON public.company_members
  FOR SELECT
  TO authenticated
  USING (
    owner_id = auth.uid()
    OR member_user_id = auth.uid()
    OR lower(email) = lower(coalesce(auth.jwt()->>'email', ''))
  );

DROP POLICY IF EXISTS "Owner inserts company members" ON public.company_members;
CREATE POLICY "Owner inserts company members"
  ON public.company_members
  FOR INSERT
  TO authenticated
  WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS "Owner updates company members" ON public.company_members;
CREATE POLICY "Owner updates company members"
  ON public.company_members
  FOR UPDATE
  TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS "Owner deletes company members" ON public.company_members;
CREATE POLICY "Owner deletes company members"
  ON public.company_members
  FOR DELETE
  TO authenticated
  USING (owner_id = auth.uid());

-- Enforce RBAC rules on company_members writes
CREATE OR REPLACE FUNCTION public.enforce_rbac_membership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sub public.subscriptions%ROWTYPE;
  effective_plan text := 'starter';
  caller_uid uuid := auth.uid();
  company_owner uuid;
  owner_company_count int;
BEGIN
  NEW.email := lower(trim(coalesce(NEW.email, '')));
  NEW.full_name := trim(coalesce(NEW.full_name, ''));

  IF NEW.email = '' THEN
    RAISE EXCEPTION 'Staff email is required.';
  END IF;
  IF NEW.full_name = '' THEN
    RAISE EXCEPTION 'Staff full name is required.';
  END IF;

  IF NOT public.is_service_or_admin() THEN
    IF caller_uid IS NULL OR caller_uid <> NEW.owner_id THEN
      RAISE EXCEPTION 'Only the account owner can invite or manage team members.';
    END IF;
    IF TG_OP = 'UPDATE' AND NEW.owner_id IS DISTINCT FROM OLD.owner_id THEN
      RAISE EXCEPTION 'Membership owner cannot be reassigned.';
    END IF;
  END IF;

  SELECT * INTO sub FROM public.subscriptions WHERE user_id = NEW.owner_id;
  effective_plan := coalesce(sub.plan, 'starter');

  IF effective_plan = 'starter' THEN
    RAISE EXCEPTION 'Starter Plan supports Single Owner Login only. Inviting sub-users or staff accounts is not permitted.';
  ELSIF effective_plan = 'platinum' THEN
    IF NEW.role <> 'safety_manager' THEN
      RAISE EXCEPTION 'Platinum Directors Plan allows Internal Safety Manager logins only.';
    END IF;
    IF NEW.company_id IS NULL THEN
      RAISE EXCEPTION 'Platinum Safety Managers must be strictly bound to your single company_id.';
    END IF;
    SELECT owner_id INTO company_owner FROM public.companies WHERE id = NEW.company_id;
    IF company_owner IS NULL OR company_owner <> NEW.owner_id THEN
      RAISE EXCEPTION 'Safety Manager must belong to your own company.';
    END IF;
    SELECT count(*)::int INTO owner_company_count FROM public.companies WHERE owner_id = NEW.owner_id;
    IF owner_company_count > 1 THEN
      RAISE EXCEPTION 'Platinum Directors Plan is restricted to 1 DOT company.';
    END IF;
  ELSIF effective_plan = 'diamond' THEN
    IF NEW.company_id IS NOT NULL THEN
      SELECT owner_id INTO company_owner FROM public.companies WHERE id = NEW.company_id;
      IF company_owner IS NULL OR company_owner <> NEW.owner_id THEN
        RAISE EXCEPTION 'Agency staff can only access companies owned by your agency.';
      END IF;
    END IF;
  END IF;

  -- Link existing user account if one already exists with this email
  IF NEW.member_user_id IS NULL THEN
    SELECT id INTO NEW.member_user_id
    FROM public.profiles
    WHERE lower(coalesce(email, '')) = NEW.email
    LIMIT 1;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS enforce_rbac_membership_trigger ON public.company_members;
CREATE TRIGGER enforce_rbac_membership_trigger
  BEFORE INSERT OR UPDATE ON public.company_members
  FOR EACH ROW EXECUTE FUNCTION public.enforce_rbac_membership();

-- Auto-link invited staff user_id when they sign up
CREATE OR REPLACE FUNCTION public.link_invited_member_on_signup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.company_members
  SET member_user_id = NEW.id
  WHERE lower(email) = lower(coalesce(NEW.email, ''))
    AND member_user_id IS NULL;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS link_invited_member_trigger ON auth.users;
CREATE TRIGGER link_invited_member_trigger
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.link_invited_member_on_signup();
REVOKE ALL ON FUNCTION public.link_invited_member_on_signup() FROM PUBLIC, anon, authenticated;

-- Strict company ownership helper (owner OR authorized company_members staff)
CREATE OR REPLACE FUNCTION public.owns_company(_company uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.companies c
    WHERE c.id = _company
      AND c.owner_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1
    FROM public.company_members cm
    JOIN public.companies c ON c.id = _company AND c.owner_id = cm.owner_id
    LEFT JOIN public.subscriptions s ON s.user_id = cm.owner_id
    WHERE cm.status = 'active'
      AND (
        cm.member_user_id = auth.uid()
        OR lower(cm.email) = lower(coalesce(auth.jwt()->>'email', ''))
      )
      AND (
        (coalesce(s.plan, 'starter') = 'platinum' AND cm.role = 'safety_manager' AND cm.company_id = _company)
        OR
        (coalesce(s.plan, 'starter') = 'diamond' AND (cm.company_id = _company OR cm.company_id IS NULL))
      )
  )
$$;

-- Allow assigned staff to read companies they belong to (still blocked from INSERT/UPDATE/DELETE)
DROP POLICY IF EXISTS "Owner reads companies" ON public.companies;
CREATE POLICY "Owner reads companies"
  ON public.companies
  FOR SELECT
  TO authenticated
  USING (owner_id = auth.uid() OR public.owns_company(id));

-- Block invited staff accounts from creating separate companies (e.g. Platinum Safety Managers)
CREATE OR REPLACE FUNCTION public.enforce_company_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  existing_count int;
  sub public.subscriptions%ROWTYPE;
  max_companies int;
  is_invited_staff boolean := false;
BEGIN
  IF NOT public.is_service_or_admin() THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.company_members cm
      WHERE cm.status = 'active'
        AND cm.owner_id <> NEW.owner_id
        AND (
          cm.member_user_id = NEW.owner_id
          OR lower(cm.email) = lower(coalesce(auth.jwt()->>'email', ''))
        )
    ) INTO is_invited_staff;

    IF is_invited_staff THEN
      RAISE EXCEPTION 'Staff and Safety Manager accounts cannot create new companies.';
    END IF;
  END IF;

  SELECT * INTO sub FROM public.subscriptions WHERE user_id = NEW.owner_id FOR UPDATE;

  IF NOT FOUND THEN
    max_companies := 1;
  ELSIF sub.plan = 'diamond' THEN
    max_companies := 50;
  ELSE
    max_companies := 1;
  END IF;

  existing_count := (
    SELECT count(*)::int FROM public.companies
    WHERE owner_id = NEW.owner_id AND id <> NEW.id
  );

  IF existing_count >= max_companies THEN
    IF max_companies = 1 THEN
      RAISE EXCEPTION 'Your plan allows 1 DOT company. Upgrade to the Diamond Agency Plan for up to 50 companies.';
    ELSE
      RAISE EXCEPTION 'Company limit reached for your plan (max % companies).', max_companies;
    END IF;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS enforce_company_limit_trigger ON public.companies;
CREATE TRIGGER enforce_company_limit_trigger
  BEFORE INSERT ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.enforce_company_limit();

-- Restrict configure_company_type to strict company owners (not staff) + Starter/Platinum lock
CREATE OR REPLACE FUNCTION public.configure_company_type(_company uuid, _type text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.companies WHERE id = _company AND owner_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Only the company owner can configure company type.';
  END IF;
  IF _type NOT IN ('fleet_owner', 'safety_agency') THEN
    RAISE EXCEPTION 'Invalid company type';
  END IF;
  UPDATE public.companies SET type = _type WHERE id = _company;
END $$;
REVOKE ALL ON FUNCTION public.configure_company_type(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.configure_company_type(uuid, text) TO authenticated;
