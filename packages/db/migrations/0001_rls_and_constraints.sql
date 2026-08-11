-- Row-level security, referential integrity and housekeeping triggers.
--
-- Written by hand rather than generated: these policies are the only thing
-- standing between one user's health data and another's, so they are kept
-- explicit and auditable instead of being emitted from a DSL.
--
-- The application never queries without first running
--   set local role authenticated;
--   select set_config('request.jwt.claims', '{"sub":"<uuid>"}', true);
-- which is what makes auth.uid() resolve. See packages/db/src/client.ts.

-- ---------------------------------------------------------------------------
-- Referential integrity
--
-- Declared here because drizzle-kit would otherwise try to manage Supabase's
-- own `auth` schema. Deleting the auth user cascades away every owned row,
-- which is what makes "delete my account" actually delete the data.
-- ---------------------------------------------------------------------------

ALTER TABLE "profiles"
  ADD CONSTRAINT "profiles_id_auth_users_fk"
  FOREIGN KEY ("id") REFERENCES auth.users("id") ON DELETE CASCADE;
--> statement-breakpoint

ALTER TABLE "goals"
  ADD CONSTRAINT "goals_user_id_auth_users_fk"
  FOREIGN KEY ("user_id") REFERENCES auth.users("id") ON DELETE CASCADE;
--> statement-breakpoint

ALTER TABLE "activity_logs"
  ADD CONSTRAINT "activity_logs_user_id_auth_users_fk"
  FOREIGN KEY ("user_id") REFERENCES auth.users("id") ON DELETE CASCADE;
--> statement-breakpoint

ALTER TABLE "step_entries"
  ADD CONSTRAINT "step_entries_user_id_auth_users_fk"
  FOREIGN KEY ("user_id") REFERENCES auth.users("id") ON DELETE CASCADE;
--> statement-breakpoint

ALTER TABLE "food_entries"
  ADD CONSTRAINT "food_entries_user_id_auth_users_fk"
  FOREIGN KEY ("user_id") REFERENCES auth.users("id") ON DELETE CASCADE;
--> statement-breakpoint

ALTER TABLE "sleep_logs"
  ADD CONSTRAINT "sleep_logs_user_id_auth_users_fk"
  FOREIGN KEY ("user_id") REFERENCES auth.users("id") ON DELETE CASCADE;
--> statement-breakpoint

ALTER TABLE "water_logs"
  ADD CONSTRAINT "water_logs_user_id_auth_users_fk"
  FOREIGN KEY ("user_id") REFERENCES auth.users("id") ON DELETE CASCADE;
--> statement-breakpoint

ALTER TABLE "vital_readings"
  ADD CONSTRAINT "vital_readings_user_id_auth_users_fk"
  FOREIGN KEY ("user_id") REFERENCES auth.users("id") ON DELETE CASCADE;
--> statement-breakpoint

ALTER TABLE "mood_logs"
  ADD CONSTRAINT "mood_logs_user_id_auth_users_fk"
  FOREIGN KEY ("user_id") REFERENCES auth.users("id") ON DELETE CASCADE;
--> statement-breakpoint

ALTER TABLE "medications"
  ADD CONSTRAINT "medications_user_id_auth_users_fk"
  FOREIGN KEY ("user_id") REFERENCES auth.users("id") ON DELETE CASCADE;
--> statement-breakpoint

ALTER TABLE "medication_events"
  ADD CONSTRAINT "medication_events_user_id_auth_users_fk"
  FOREIGN KEY ("user_id") REFERENCES auth.users("id") ON DELETE CASCADE;
--> statement-breakpoint

ALTER TABLE "medication_events"
  ADD CONSTRAINT "medication_events_medication_id_fk"
  FOREIGN KEY ("medication_id") REFERENCES "medications"("id") ON DELETE CASCADE;
--> statement-breakpoint

ALTER TABLE "api_tokens"
  ADD CONSTRAINT "api_tokens_user_id_auth_users_fk"
  FOREIGN KEY ("user_id") REFERENCES auth.users("id") ON DELETE CASCADE;
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Privileges
--
-- `anon` gets nothing: there is no such thing as public health data here.
-- `authenticated` gets DML only, and RLS narrows it to its own rows.
-- ---------------------------------------------------------------------------

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
--> statement-breakpoint

GRANT USAGE ON SCHEMA public TO authenticated;
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Row-level security
--
-- One FOR ALL policy per table. USING covers SELECT/UPDATE/DELETE, WITH CHECK
-- covers INSERT/UPDATE, so there is no operation left unguarded and no gap
-- between four separately-maintained policies.
-- ---------------------------------------------------------------------------

ALTER TABLE "profiles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "profiles_own_rows" ON "profiles"
  FOR ALL TO authenticated
  USING ("id" = auth.uid())
  WITH CHECK ("id" = auth.uid());
--> statement-breakpoint

ALTER TABLE "goals" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "goals_own_rows" ON "goals"
  FOR ALL TO authenticated
  USING ("user_id" = auth.uid())
  WITH CHECK ("user_id" = auth.uid());
--> statement-breakpoint

ALTER TABLE "activity_logs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "activity_logs_own_rows" ON "activity_logs"
  FOR ALL TO authenticated
  USING ("user_id" = auth.uid())
  WITH CHECK ("user_id" = auth.uid());
--> statement-breakpoint

ALTER TABLE "step_entries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "step_entries_own_rows" ON "step_entries"
  FOR ALL TO authenticated
  USING ("user_id" = auth.uid())
  WITH CHECK ("user_id" = auth.uid());
--> statement-breakpoint

ALTER TABLE "food_entries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "food_entries_own_rows" ON "food_entries"
  FOR ALL TO authenticated
  USING ("user_id" = auth.uid())
  WITH CHECK ("user_id" = auth.uid());
--> statement-breakpoint

ALTER TABLE "sleep_logs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "sleep_logs_own_rows" ON "sleep_logs"
  FOR ALL TO authenticated
  USING ("user_id" = auth.uid())
  WITH CHECK ("user_id" = auth.uid());
--> statement-breakpoint

ALTER TABLE "water_logs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "water_logs_own_rows" ON "water_logs"
  FOR ALL TO authenticated
  USING ("user_id" = auth.uid())
  WITH CHECK ("user_id" = auth.uid());
--> statement-breakpoint

ALTER TABLE "vital_readings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "vital_readings_own_rows" ON "vital_readings"
  FOR ALL TO authenticated
  USING ("user_id" = auth.uid())
  WITH CHECK ("user_id" = auth.uid());
--> statement-breakpoint

ALTER TABLE "mood_logs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "mood_logs_own_rows" ON "mood_logs"
  FOR ALL TO authenticated
  USING ("user_id" = auth.uid())
  WITH CHECK ("user_id" = auth.uid());
--> statement-breakpoint

ALTER TABLE "medications" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "medications_own_rows" ON "medications"
  FOR ALL TO authenticated
  USING ("user_id" = auth.uid())
  WITH CHECK ("user_id" = auth.uid());
--> statement-breakpoint

ALTER TABLE "medication_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "medication_events_own_rows" ON "medication_events"
  FOR ALL TO authenticated
  USING ("user_id" = auth.uid())
  WITH CHECK ("user_id" = auth.uid());
--> statement-breakpoint

ALTER TABLE "api_tokens" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "api_tokens_own_rows" ON "api_tokens"
  FOR ALL TO authenticated
  USING ("user_id" = auth.uid())
  WITH CHECK ("user_id" = auth.uid());
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- MCP token resolution
--
-- Resolving an opaque bearer token to its owner necessarily happens before a
-- user is known, so it cannot run under RLS. Isolating it in a SECURITY
-- DEFINER function keeps that exception to exactly one auditable place, and
-- keeps the application from ever needing a service-role key at runtime.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.resolve_api_token(token_hash_input text)
RETURNS TABLE (user_id uuid, token_id uuid)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT t.user_id, t.id
  FROM public.api_tokens t
  WHERE t.token_hash = token_hash_input
    AND t.revoked_at IS NULL
    AND (t.expires_at IS NULL OR t.expires_at > now())
  LIMIT 1;
$$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION public.resolve_api_token(text) FROM public, anon, authenticated;
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER touch_profiles BEFORE UPDATE ON "profiles"
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();--> statement-breakpoint
CREATE TRIGGER touch_goals BEFORE UPDATE ON "goals"
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();--> statement-breakpoint
CREATE TRIGGER touch_activity_logs BEFORE UPDATE ON "activity_logs"
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();--> statement-breakpoint
CREATE TRIGGER touch_step_entries BEFORE UPDATE ON "step_entries"
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();--> statement-breakpoint
CREATE TRIGGER touch_food_entries BEFORE UPDATE ON "food_entries"
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();--> statement-breakpoint
CREATE TRIGGER touch_sleep_logs BEFORE UPDATE ON "sleep_logs"
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();--> statement-breakpoint
CREATE TRIGGER touch_water_logs BEFORE UPDATE ON "water_logs"
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();--> statement-breakpoint
CREATE TRIGGER touch_vital_readings BEFORE UPDATE ON "vital_readings"
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();--> statement-breakpoint
CREATE TRIGGER touch_mood_logs BEFORE UPDATE ON "mood_logs"
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();--> statement-breakpoint
CREATE TRIGGER touch_medications BEFORE UPDATE ON "medications"
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();--> statement-breakpoint
CREATE TRIGGER touch_medication_events BEFORE UPDATE ON "medication_events"
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();--> statement-breakpoint
CREATE TRIGGER touch_api_tokens BEFORE UPDATE ON "api_tokens"
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Provisioning on signup
--
-- A new auth user gets a profile and a goals row immediately, so the app never
-- has to cope with a half-existent account. Runs as definer because the
-- signing-up user has no rows of their own yet.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    NULLIF(NEW.raw_user_meta_data ->> 'full_name', '')
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.goals (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;
--> statement-breakpoint

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
--> statement-breakpoint

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
