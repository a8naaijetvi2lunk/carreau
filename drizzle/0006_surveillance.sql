ALTER TABLE "evenement" ADD COLUMN "chargement" text;--> statement-breakpoint
ALTER TABLE "evenement" ADD COLUMN "sequence" integer;--> statement-breakpoint
ALTER TABLE "participation" ADD COLUMN "indice" integer;--> statement-breakpoint
ALTER TABLE "participation" ADD COLUMN "indice_version" integer;--> statement-breakpoint
ALTER TABLE "participation" ADD COLUMN "indice_detail" jsonb;--> statement-breakpoint
CREATE UNIQUE INDEX "evenement_chargement_sequence_unique" ON "evenement" USING btree ("participation_id","chargement","sequence");