CREATE TABLE "ai_provider_configs" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"provider" text NOT NULL,
	"config" jsonb NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_usage" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"project_id" text,
	"user_id" text NOT NULL,
	"capability" text NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"tokens_in" integer DEFAULT 0 NOT NULL,
	"tokens_out" integer DEFAULT 0 NOT NULL,
	"ts" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_usage_capability_ck" CHECK ("ai_usage"."capability" in ('decompose','summarize','complete','converse','rewrite'))
);
--> statement-breakpoint
ALTER TABLE "ai_provider_configs" ADD CONSTRAINT "ai_provider_configs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_ai_default" ON "ai_provider_configs" USING btree ("tenant_id") WHERE "ai_provider_configs"."is_default";--> statement-breakpoint
CREATE INDEX "ix_ai_usage_tenant_ts" ON "ai_usage" USING btree ("tenant_id","ts");