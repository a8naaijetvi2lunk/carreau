CREATE TYPE "public"."type_session" AS ENUM('classe', 'rattrapage');--> statement-breakpoint
CREATE TABLE "session_autorisation" (
	"session_id" uuid NOT NULL,
	"etudiant_id" uuid NOT NULL,
	CONSTRAINT "session_autorisation_session_id_etudiant_id_pk" PRIMARY KEY("session_id","etudiant_id")
);
--> statement-breakpoint
ALTER TABLE "session_examen" ADD COLUMN "type" "type_session" DEFAULT 'classe' NOT NULL;--> statement-breakpoint
ALTER TABLE "session_examen" ADD COLUMN "session_origine_id" uuid;--> statement-breakpoint
ALTER TABLE "session_autorisation" ADD CONSTRAINT "session_autorisation_session_id_session_examen_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."session_examen"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_autorisation" ADD CONSTRAINT "session_autorisation_etudiant_id_etudiant_id_fk" FOREIGN KEY ("etudiant_id") REFERENCES "public"."etudiant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "session_autorisation_etudiant_idx" ON "session_autorisation" USING btree ("etudiant_id");--> statement-breakpoint
ALTER TABLE "session_examen" ADD CONSTRAINT "session_examen_session_origine_id_session_examen_id_fk" FOREIGN KEY ("session_origine_id") REFERENCES "public"."session_examen"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "session_examen_origine_idx" ON "session_examen" USING btree ("session_origine_id");--> statement-breakpoint
ALTER TABLE "session_examen" ADD CONSTRAINT "session_examen_origine_rattrapage" CHECK (("session_examen"."type" = 'rattrapage') = ("session_examen"."session_origine_id" is not null));