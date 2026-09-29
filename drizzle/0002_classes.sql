CREATE TABLE "classe" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"enseignant_id" uuid NOT NULL,
	"nom" text NOT NULL,
	"archivee" boolean DEFAULT false NOT NULL,
	"cree_le" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "etudiant" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"classe_id" uuid NOT NULL,
	"nom" text NOT NULL,
	"prenom" text NOT NULL,
	"nom_normalise" text NOT NULL,
	"prenom_normalise" text NOT NULL,
	"tiers_temps" boolean DEFAULT false NOT NULL,
	"cree_le" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "classe" ADD CONSTRAINT "classe_enseignant_id_utilisateur_id_fk" FOREIGN KEY ("enseignant_id") REFERENCES "public"."utilisateur"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "etudiant" ADD CONSTRAINT "etudiant_classe_id_classe_id_fk" FOREIGN KEY ("classe_id") REFERENCES "public"."classe"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "classe_enseignant_nom_unique" ON "classe" USING btree ("enseignant_id",lower("nom"));--> statement-breakpoint
CREATE UNIQUE INDEX "etudiant_classe_nom_unique" ON "etudiant" USING btree ("classe_id","nom_normalise","prenom_normalise");