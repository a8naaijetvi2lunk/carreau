CREATE TYPE "public"."origine_reponse" AS ENUM('validation', 'echeance', 'fin');--> statement-breakpoint
CREATE TABLE "reponse" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"participation_id" uuid NOT NULL,
	"question_cle" text NOT NULL,
	"selection_brouillon" jsonb,
	"selection" jsonb,
	"validee_le" timestamp with time zone,
	"origine" "origine_reponse",
	"points" numeric(6, 2),
	CONSTRAINT "reponse_validation_complete" CHECK (("reponse"."validee_le" is null) = ("reponse"."selection" is null) and ("reponse"."validee_le" is null) = ("reponse"."origine" is null) and ("reponse"."validee_le" is null) = ("reponse"."points" is null))
);
--> statement-breakpoint
ALTER TABLE "participation" ADD COLUMN "tiers_temps" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "participation" ADD COLUMN "ordre" jsonb;--> statement-breakpoint
ALTER TABLE "participation" ADD COLUMN "index_courant" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "participation" ADD COLUMN "question_servie_le" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "participation" ADD COLUMN "echeance_question_le" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "participation" ADD COLUMN "echeance_globale_le" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "participation" ADD COLUMN "terminee_le" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "participation" ADD COLUMN "points" numeric(8, 2);--> statement-breakpoint
ALTER TABLE "participation" ADD COLUMN "note_sur_20" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "session_examen" ADD COLUMN "contenu" jsonb;--> statement-breakpoint
ALTER TABLE "session_examen" ADD COLUMN "fin_prevue_le" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "reponse" ADD CONSTRAINT "reponse_participation_id_participation_id_fk" FOREIGN KEY ("participation_id") REFERENCES "public"."participation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "reponse_participation_question_unique" ON "reponse" USING btree ("participation_id","question_cle");--> statement-breakpoint
CREATE INDEX "participation_session_statut_idx" ON "participation" USING btree ("session_id","statut");