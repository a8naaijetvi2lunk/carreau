CREATE TYPE "public"."portee_jeton_mcp" AS ENUM('lecture', 'ecriture');--> statement-breakpoint
CREATE TYPE "public"."role_utilisateur" AS ENUM('super_admin', 'admin', 'enseignant');--> statement-breakpoint
CREATE TABLE "invitation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"role" "role_utilisateur" NOT NULL,
	"jeton_hash" text NOT NULL,
	"invite_par" uuid,
	"cree_le" timestamp with time zone NOT NULL,
	"expire_le" timestamp with time zone NOT NULL,
	"utilisee_le" timestamp with time zone,
	"annulee_le" timestamp with time zone,
	CONSTRAINT "invitation_email_minuscules" CHECK ("invitation"."email" = lower("invitation"."email"))
);
--> statement-breakpoint
CREATE TABLE "jeton_mcp" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"enseignant_id" uuid NOT NULL,
	"nom" text NOT NULL,
	"prefixe" text NOT NULL,
	"jeton_hash" text NOT NULL,
	"portee" "portee_jeton_mcp" NOT NULL,
	"cree_le" timestamp with time zone NOT NULL,
	"dernier_usage_le" timestamp with time zone,
	"revoque_le" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "jeton_reinitialisation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"utilisateur_id" uuid NOT NULL,
	"jeton_hash" text NOT NULL,
	"cree_le" timestamp with time zone NOT NULL,
	"expire_le" timestamp with time zone NOT NULL,
	"utilise_le" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "parametres" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"resend_cle_chiffree" text,
	"email_expediteur" text,
	"nom_expediteur" text,
	"validite_invitation_jours" integer DEFAULT 7 NOT NULL,
	"conservation_evenements_jours" integer,
	"conservation_resultats_jours" integer,
	"contact_donnees" text,
	"modifie_le" timestamp with time zone,
	CONSTRAINT "parametres_ligne_unique" CHECK ("parametres"."id" = 1),
	CONSTRAINT "parametres_validite_invitation" CHECK ("parametres"."validite_invitation_jours" BETWEEN 1 AND 30)
);
--> statement-breakpoint
CREATE TABLE "session_connexion" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"utilisateur_id" uuid NOT NULL,
	"jeton_hash" text NOT NULL,
	"cree_le" timestamp with time zone NOT NULL,
	"derniere_activite_le" timestamp with time zone NOT NULL,
	"expire_le" timestamp with time zone NOT NULL,
	"double_auth_validee" boolean DEFAULT false NOT NULL,
	"rester_connecte" boolean DEFAULT false NOT NULL,
	"totp_en_attente_chiffre" text
);
--> statement-breakpoint
CREATE TABLE "utilisateur" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"nom" text NOT NULL,
	"prenom" text NOT NULL,
	"role" "role_utilisateur" NOT NULL,
	"mot_de_passe_hash" text NOT NULL,
	"totp_secret_chiffre" text,
	"totp_dernier_pas" integer,
	"actif" boolean DEFAULT true NOT NULL,
	"cree_le" timestamp with time zone NOT NULL,
	"derniere_connexion_le" timestamp with time zone,
	CONSTRAINT "utilisateur_email_minuscules" CHECK ("utilisateur"."email" = lower("utilisateur"."email"))
);
--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_invite_par_utilisateur_id_fk" FOREIGN KEY ("invite_par") REFERENCES "public"."utilisateur"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jeton_mcp" ADD CONSTRAINT "jeton_mcp_enseignant_id_utilisateur_id_fk" FOREIGN KEY ("enseignant_id") REFERENCES "public"."utilisateur"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jeton_reinitialisation" ADD CONSTRAINT "jeton_reinitialisation_utilisateur_id_utilisateur_id_fk" FOREIGN KEY ("utilisateur_id") REFERENCES "public"."utilisateur"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_connexion" ADD CONSTRAINT "session_connexion_utilisateur_id_utilisateur_id_fk" FOREIGN KEY ("utilisateur_id") REFERENCES "public"."utilisateur"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "invitation_jeton_hash_unique" ON "invitation" USING btree ("jeton_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "invitation_email_en_attente_unique" ON "invitation" USING btree ("email") WHERE "invitation"."utilisee_le" IS NULL AND "invitation"."annulee_le" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "jeton_mcp_jeton_hash_unique" ON "jeton_mcp" USING btree ("jeton_hash");--> statement-breakpoint
CREATE INDEX "jeton_mcp_enseignant_idx" ON "jeton_mcp" USING btree ("enseignant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "jeton_reinitialisation_jeton_hash_unique" ON "jeton_reinitialisation" USING btree ("jeton_hash");--> statement-breakpoint
CREATE INDEX "jeton_reinitialisation_utilisateur_idx" ON "jeton_reinitialisation" USING btree ("utilisateur_id");--> statement-breakpoint
CREATE UNIQUE INDEX "session_connexion_jeton_hash_unique" ON "session_connexion" USING btree ("jeton_hash");--> statement-breakpoint
CREATE INDEX "session_connexion_utilisateur_idx" ON "session_connexion" USING btree ("utilisateur_id");--> statement-breakpoint
CREATE UNIQUE INDEX "utilisateur_email_unique" ON "utilisateur" USING btree ("email");