CREATE TYPE "public"."type_acteur" AS ENUM('utilisateur', 'participation', 'jeton', 'systeme', 'anonyme');--> statement-breakpoint
CREATE TABLE "journal" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"acteur_type" "type_acteur" NOT NULL,
	"acteur_id" uuid,
	"action" text NOT NULL,
	"cible" text,
	"details" jsonb NOT NULL,
	"cree_le" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "limiteur" (
	"cle" text PRIMARY KEY NOT NULL,
	"compteur" integer NOT NULL,
	"fenetre_debut" timestamp with time zone NOT NULL,
	"bloque_jusqu_au" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "journal_cree_le_idx" ON "journal" USING btree ("cree_le");