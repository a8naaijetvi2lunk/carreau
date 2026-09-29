CREATE TYPE "public"."mode_chrono" AS ENUM('aucun', 'global', 'par_question');--> statement-breakpoint
CREATE TYPE "public"."origine_qcm" AS ENUM('interface', 'mcp');--> statement-breakpoint
CREATE TYPE "public"."statut_qcm" AS ENUM('brouillon', 'pret', 'archive');--> statement-breakpoint
CREATE TYPE "public"."type_question" AS ENUM('unique', 'multiple', 'vrai_faux');--> statement-breakpoint
CREATE TABLE "image" (
	"id" uuid PRIMARY KEY NOT NULL,
	"enseignant_id" uuid NOT NULL,
	"largeur" integer NOT NULL,
	"hauteur" integer NOT NULL,
	"octets" integer NOT NULL,
	"cree_le" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "proposition" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"texte" text DEFAULT '' NOT NULL,
	"image_id" uuid,
	"correcte" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "qcm" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"enseignant_id" uuid NOT NULL,
	"titre" text NOT NULL,
	"statut" "statut_qcm" DEFAULT 'brouillon' NOT NULL,
	"origine" "origine_qcm" DEFAULT 'interface' NOT NULL,
	"mode_chrono" "mode_chrono" DEFAULT 'aucun' NOT NULL,
	"duree_globale_s" integer,
	"duree_question_s" integer,
	"note_visible_defaut" boolean DEFAULT true NOT NULL,
	"correction_visible_defaut" boolean DEFAULT false NOT NULL,
	"cree_le" timestamp with time zone NOT NULL,
	"modifie_le" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "question" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"qcm_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"type" "type_question" DEFAULT 'unique' NOT NULL,
	"enonce" text DEFAULT '' NOT NULL,
	"image_id" uuid,
	"code_langage" text,
	"code_source" text,
	"points_bonne" numeric(6, 2) DEFAULT 1 NOT NULL,
	"points_mauvaise" numeric(6, 2) DEFAULT 0 NOT NULL,
	"points_vide" numeric(6, 2) DEFAULT 0 NOT NULL,
	"duree_s" integer,
	"liee_a_suivante" boolean DEFAULT false NOT NULL,
	CONSTRAINT "question_code_complet" CHECK (("question"."code_langage" is null) = ("question"."code_source" is null))
);
--> statement-breakpoint
ALTER TABLE "image" ADD CONSTRAINT "image_enseignant_id_utilisateur_id_fk" FOREIGN KEY ("enseignant_id") REFERENCES "public"."utilisateur"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposition" ADD CONSTRAINT "proposition_question_id_question_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."question"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposition" ADD CONSTRAINT "proposition_image_id_image_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."image"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qcm" ADD CONSTRAINT "qcm_enseignant_id_utilisateur_id_fk" FOREIGN KEY ("enseignant_id") REFERENCES "public"."utilisateur"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question" ADD CONSTRAINT "question_qcm_id_qcm_id_fk" FOREIGN KEY ("qcm_id") REFERENCES "public"."qcm"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question" ADD CONSTRAINT "question_image_id_image_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."image"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "image_enseignant_idx" ON "image" USING btree ("enseignant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "proposition_question_position_unique" ON "proposition" USING btree ("question_id","position");--> statement-breakpoint
CREATE INDEX "qcm_enseignant_idx" ON "qcm" USING btree ("enseignant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "question_qcm_position_unique" ON "question" USING btree ("qcm_id","position");