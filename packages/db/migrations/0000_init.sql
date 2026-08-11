CREATE TYPE "public"."activity_intensity" AS ENUM('light', 'moderate', 'vigorous');--> statement-breakpoint
CREATE TYPE "public"."activity_level" AS ENUM('sedentary', 'lightly_active', 'moderately_active', 'very_active', 'extra_active');--> statement-breakpoint
CREATE TYPE "public"."entry_source" AS ENUM('manual', 'mcp', 'import', 'demo');--> statement-breakpoint
CREATE TYPE "public"."food_source" AS ENUM('usda', 'open_food_facts', 'custom', 'recent');--> statement-breakpoint
CREATE TYPE "public"."meal_type" AS ENUM('breakfast', 'lunch', 'dinner', 'snack');--> statement-breakpoint
CREATE TYPE "public"."medication_status" AS ENUM('taken', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."sex" AS ENUM('male', 'female', 'other', 'prefer_not_to_say');--> statement-breakpoint
CREATE TYPE "public"."unit_system" AS ENUM('metric', 'imperial');--> statement-breakpoint
CREATE TYPE "public"."vital_type" AS ENUM('weight', 'resting_heart_rate', 'blood_pressure', 'blood_glucose');--> statement-breakpoint
CREATE TYPE "public"."weight_goal" AS ENUM('lose', 'maintain', 'gain');--> statement-breakpoint
CREATE TABLE "activity_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"activity_slug" text NOT NULL,
	"intensity" "activity_intensity" DEFAULT 'moderate' NOT NULL,
	"duration_minutes" integer NOT NULL,
	"distance_km" double precision,
	"calories_burned" integer,
	"notes" text,
	"source" "entry_source" DEFAULT 'manual' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "activity_logs_duration_positive" CHECK ("activity_logs"."duration_minutes" > 0),
	CONSTRAINT "activity_logs_duration_sane" CHECK ("activity_logs"."duration_minutes" <= 1440)
);
--> statement-breakpoint
CREATE TABLE "api_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"token_hash" text NOT NULL,
	"prefix" text NOT NULL,
	"last_used_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "food_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"meal_type" "meal_type" NOT NULL,
	"name" text NOT NULL,
	"brand" text,
	"food_source" "food_source" DEFAULT 'custom' NOT NULL,
	"external_id" text,
	"barcode" text,
	"quantity" double precision DEFAULT 1 NOT NULL,
	"unit" text DEFAULT 'serving' NOT NULL,
	"calories" integer NOT NULL,
	"protein_g" double precision DEFAULT 0 NOT NULL,
	"carbs_g" double precision DEFAULT 0 NOT NULL,
	"fat_g" double precision DEFAULT 0 NOT NULL,
	"fiber_g" double precision DEFAULT 0 NOT NULL,
	"sugar_g" double precision DEFAULT 0 NOT NULL,
	"sodium_mg" double precision DEFAULT 0 NOT NULL,
	"source" "entry_source" DEFAULT 'manual' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "food_entries_calories_non_negative" CHECK ("food_entries"."calories" >= 0),
	CONSTRAINT "food_entries_quantity_positive" CHECK ("food_entries"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "goals" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"calorie_target" integer,
	"protein_target_g" integer,
	"carbs_target_g" integer,
	"fat_target_g" integer,
	"water_target_ml" integer DEFAULT 2000 NOT NULL,
	"sleep_target_minutes" integer DEFAULT 480 NOT NULL,
	"steps_target" integer DEFAULT 8000 NOT NULL,
	"active_minutes_target" integer DEFAULT 30 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "goals_calorie_floor" CHECK ("goals"."calorie_target" IS NULL OR ("goals"."calorie_target" BETWEEN 1200 AND 8000)),
	CONSTRAINT "goals_water_sane" CHECK ("goals"."water_target_ml" BETWEEN 250 AND 10000),
	CONSTRAINT "goals_sleep_sane" CHECK ("goals"."sleep_target_minutes" BETWEEN 180 AND 900)
);
--> statement-breakpoint
CREATE TABLE "medication_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"medication_id" uuid NOT NULL,
	"scheduled_for" timestamp with time zone NOT NULL,
	"status" "medication_status" NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"source" "entry_source" DEFAULT 'manual' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "medications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"dosage" text,
	"schedule_times" text[] DEFAULT '{}'::text[] NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"started_on" date,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mood_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"score" integer NOT NULL,
	"note" text,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"source" "entry_source" DEFAULT 'manual' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mood_logs_score_range" CHECK ("mood_logs"."score" BETWEEN 1 AND 5)
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"display_name" text,
	"birth_date" date,
	"sex" "sex" DEFAULT 'prefer_not_to_say' NOT NULL,
	"height_cm" double precision,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"unit_system" "unit_system" DEFAULT 'metric' NOT NULL,
	"activity_level" "activity_level" DEFAULT 'lightly_active' NOT NULL,
	"weight_goal" "weight_goal" DEFAULT 'maintain' NOT NULL,
	"onboarding_completed_at" timestamp with time zone,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profiles_height_sane" CHECK ("profiles"."height_cm" IS NULL OR ("profiles"."height_cm" BETWEEN 50 AND 280))
);
--> statement-breakpoint
CREATE TABLE "sleep_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"bedtime" timestamp with time zone NOT NULL,
	"wake_time" timestamp with time zone NOT NULL,
	"duration_minutes" integer NOT NULL,
	"quality" integer,
	"notes" text,
	"source" "entry_source" DEFAULT 'manual' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sleep_logs_quality_range" CHECK ("sleep_logs"."quality" IS NULL OR ("sleep_logs"."quality" BETWEEN 1 AND 5)),
	CONSTRAINT "sleep_logs_ordered" CHECK ("sleep_logs"."wake_time" > "sleep_logs"."bedtime"),
	CONSTRAINT "sleep_logs_duration_sane" CHECK ("sleep_logs"."duration_minutes" BETWEEN 1 AND 1440)
);
--> statement-breakpoint
CREATE TABLE "step_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"day" date NOT NULL,
	"steps" integer NOT NULL,
	"source" "entry_source" DEFAULT 'manual' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "step_entries_non_negative" CHECK ("step_entries"."steps" >= 0)
);
--> statement-breakpoint
CREATE TABLE "vital_readings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"type" "vital_type" NOT NULL,
	"value" double precision NOT NULL,
	"secondary_value" double precision,
	"notes" text,
	"source" "entry_source" DEFAULT 'manual' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vital_readings_value_positive" CHECK ("vital_readings"."value" > 0),
	CONSTRAINT "vital_readings_secondary_only_for_bp" CHECK ("vital_readings"."secondary_value" IS NULL OR "vital_readings"."type" = 'blood_pressure')
);
--> statement-breakpoint
CREATE TABLE "water_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"amount_ml" integer NOT NULL,
	"source" "entry_source" DEFAULT 'manual' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "water_logs_amount_positive" CHECK ("water_logs"."amount_ml" > 0),
	CONSTRAINT "water_logs_amount_sane" CHECK ("water_logs"."amount_ml" <= 5000)
);
--> statement-breakpoint
CREATE INDEX "activity_logs_user_time_idx" ON "activity_logs" USING btree ("user_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "api_tokens_hash_key" ON "api_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "api_tokens_user_idx" ON "api_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "food_entries_user_time_idx" ON "food_entries" USING btree ("user_id","occurred_at");--> statement-breakpoint
CREATE INDEX "food_entries_user_name_idx" ON "food_entries" USING btree ("user_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "medication_events_dose_key" ON "medication_events" USING btree ("medication_id","scheduled_for");--> statement-breakpoint
CREATE INDEX "medication_events_user_time_idx" ON "medication_events" USING btree ("user_id","scheduled_for");--> statement-breakpoint
CREATE INDEX "medications_user_active_idx" ON "medications" USING btree ("user_id","active");--> statement-breakpoint
CREATE INDEX "mood_logs_user_time_idx" ON "mood_logs" USING btree ("user_id","occurred_at");--> statement-breakpoint
CREATE INDEX "sleep_logs_user_time_idx" ON "sleep_logs" USING btree ("user_id","wake_time");--> statement-breakpoint
CREATE UNIQUE INDEX "step_entries_user_day_source_key" ON "step_entries" USING btree ("user_id","day","source");--> statement-breakpoint
CREATE INDEX "step_entries_user_day_idx" ON "step_entries" USING btree ("user_id","day");--> statement-breakpoint
CREATE INDEX "vital_readings_user_type_time_idx" ON "vital_readings" USING btree ("user_id","type","occurred_at");--> statement-breakpoint
CREATE INDEX "water_logs_user_time_idx" ON "water_logs" USING btree ("user_id","occurred_at");