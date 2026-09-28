import { z } from "zod";

/** Clé AES-256-GCM : base64 qui décode exactement 32 octets. */
const schemaCleChiffrement = z
  .string()
  .refine((valeur) => /^[A-Za-z0-9+/]+={0,2}$/.test(valeur) && Buffer.from(valeur, "base64").length === 32, {
    error:
      "doit être une chaîne base64 qui décode exactement 32 octets. Pour en générer une : " +
      "node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\"",
  });

/**
 * Variables d'environnement du serveur. Toute nouvelle variable s'ajoute ici :
 * jamais de `process.env.X || 'défaut'` ailleurs.
 */
const schemaEnv = z.object({
  DATABASE_URL: z.url({
    protocol: /^postgres(ql)?$/,
    error: "doit être une URL de connexion postgres:// ou postgresql:// valide",
  }),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  // URL publique de l'application (liens d'invitation, QR codes, MCP).
  APP_URL: z.url({ protocol: /^https?$/, error: "doit être l'URL publique http(s) de l'application" }),
  // Répertoire du volume des images téléversées.
  IMAGES_DIR: z
    .string({ error: "doit indiquer le répertoire des images" })
    .trim()
    .min(1, { error: "doit indiquer le répertoire des images" }),
  // Clé AES-256-GCM (secret TOTP, clé Resend chiffrée en base).
  CHIFFREMENT_CLE: schemaCleChiffrement,
  // Secret de la route des purges (Authorization: Bearer …). Facultatif : absent ou vide,
  // la route refuse tous les appels. Un seul mot, 32 caractères au moins.
  CRON_SECRET: z.preprocess(
    (valeur) => (valeur === "" ? undefined : valeur),
    z
      .string({ error: "doit contenir le secret de la tâche planifiée des purges" })
      .regex(/^\S+$/, { error: "ne doit contenir ni espace ni retour à la ligne" })
      .min(32, { error: "doit faire au moins 32 caractères" })
      .optional(),
  ),
});

export type Env = z.infer<typeof schemaEnv>;

let envMemoise: Env | undefined;

/**
 * Valide et renvoie les variables d'environnement. Volontairement paresseuse :
 * `next build` ne dispose d'aucune variable. Appelée au démarrage dans
 * `src/instrumentation.ts`, pour que le serveur refuse de démarrer si elles sont invalides.
 */
export function env(): Env {
  if (envMemoise) return envMemoise;
  const resultat = schemaEnv.safeParse(process.env);
  if (!resultat.success) {
    throw new Error(`Variables d'environnement invalides :\n${z.prettifyError(resultat.error)}`);
  }
  envMemoise = resultat.data;
  return envMemoise;
}

/** Vide le cache de `env()`. Réservé aux tests. */
export function reinitialiserEnvPourLesTests(): void {
  envMemoise = undefined;
}
