CREATE TYPE "public"."motif_demande" AS ENUM('second_appareil', 'reprise');--> statement-breakpoint
CREATE TYPE "public"."statut_demande" AS ENUM('en_attente', 'autorisee', 'refusee', 'expiree');--> statement-breakpoint
CREATE TYPE "public"."statut_participation" AS ENUM('attente', 'en_cours', 'terminee');--> statement-breakpoint
CREATE TYPE "public"."statut_session" AS ENUM('attente', 'en_cours', 'terminee', 'annulee');--> statement-breakpoint
CREATE TABLE "demande_appareil" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"participation_id" uuid NOT NULL,
	"motif" "motif_demande" NOT NULL,
	"jeton_hash" text NOT NULL,
	"ancien_jeton_hash" text,
	"statut" "statut_demande" DEFAULT 'en_attente' NOT NULL,
	"cree_le" timestamp with time zone NOT NULL,
	"traitee_le" timestamp with time zone,
	"traitee_par" uuid
);
--> statement-breakpoint
CREATE TABLE "evenement" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"participation_id" uuid NOT NULL,
	"type" text NOT NULL,
	"recu_le" timestamp with time zone NOT NULL,
	"duree_ms" integer,
	"question_index" integer,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "participation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"etudiant_id" uuid NOT NULL,
	"appareil_jeton_hash" text NOT NULL,
	"statut" "statut_participation" DEFAULT 'attente' NOT NULL,
	"information_lue_le" timestamp with time zone,
	"rejointe_le" timestamp with time zone NOT NULL,
	"dernier_contact_le" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session_examen" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"qcm_id" uuid NOT NULL,
	"classe_id" uuid NOT NULL,
	"enseignant_id" uuid NOT NULL,
	"statut" "statut_session" DEFAULT 'attente' NOT NULL,
	"code_secret" text NOT NULL,
	"creneau_prevu_le" timestamp with time zone,
	"note_visible" boolean NOT NULL,
	"correction_visible" boolean NOT NULL,
	"cree_le" timestamp with time zone NOT NULL,
	"demarre_le" timestamp with time zone,
	"termine_le" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "demande_appareil" ADD CONSTRAINT "demande_appareil_participation_id_participation_id_fk" FOREIGN KEY ("participation_id") REFERENCES "public"."participation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demande_appareil" ADD CONSTRAINT "demande_appareil_traitee_par_utilisateur_id_fk" FOREIGN KEY ("traitee_par") REFERENCES "public"."utilisateur"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evenement" ADD CONSTRAINT "evenement_participation_id_participation_id_fk" FOREIGN KEY ("participation_id") REFERENCES "public"."participation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participation" ADD CONSTRAINT "participation_session_id_session_examen_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."session_examen"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participation" ADD CONSTRAINT "participation_etudiant_id_etudiant_id_fk" FOREIGN KEY ("etudiant_id") REFERENCES "public"."etudiant"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_examen" ADD CONSTRAINT "session_examen_qcm_id_qcm_id_fk" FOREIGN KEY ("qcm_id") REFERENCES "public"."qcm"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_examen" ADD CONSTRAINT "session_examen_classe_id_classe_id_fk" FOREIGN KEY ("classe_id") REFERENCES "public"."classe"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_examen" ADD CONSTRAINT "session_examen_enseignant_id_utilisateur_id_fk" FOREIGN KEY ("enseignant_id") REFERENCES "public"."utilisateur"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "demande_appareil_jeton_unique" ON "demande_appareil" USING btree ("jeton_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "demande_appareil_en_attente_unique" ON "demande_appareil" USING btree ("participation_id") WHERE "demande_appareil"."statut" = 'en_attente';--> statement-breakpoint
CREATE INDEX "demande_appareil_ancien_jeton_idx" ON "demande_appareil" USING btree ("ancien_jeton_hash");--> statement-breakpoint
CREATE INDEX "evenement_participation_recu_idx" ON "evenement" USING btree ("participation_id","recu_le");--> statement-breakpoint
CREATE UNIQUE INDEX "participation_session_etudiant_unique" ON "participation" USING btree ("session_id","etudiant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "participation_appareil_unique" ON "participation" USING btree ("appareil_jeton_hash");--> statement-breakpoint
CREATE INDEX "session_examen_enseignant_idx" ON "session_examen" USING btree ("enseignant_id");--> statement-breakpoint
CREATE INDEX "session_examen_statut_idx" ON "session_examen" USING btree ("statut");