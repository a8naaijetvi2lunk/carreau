# Journal des modifications

Toutes les évolutions notables de Carreau sont consignées ici, de la plus récente à la plus ancienne.

## 2026-09-29 — Lot 1 : comptes

### Ajouté
- Authentification maison : mots de passe argon2id, sessions en deux temps (mot de passe puis TOTP), cookie `__Host-carreau_session` selon le protocole d'`APP_URL`.
- TOTP écrit dans le projet (HOTP et TOTP des RFC 4226 et 6238, base32 de la RFC 4648, `node:crypto`) avec anti-rejeu, QR code et clé à saisir à la main.
- Comptes : invitations par lien à usage unique portant seulement l'email et le rôle, activation (mot de passe puis enrôlement du TOTP), gestion des comptes (lister, désactiver, réactiver, réinitialiser la double authentification, changer le rôle), mot de passe oublié.
- Rôles `super_admin` / `admin` / `enseignant` ; droits vérifiés dans les services ; au moins un super-admin actif garanti sous verrou.
- Paramètres de l'installation : envoi Resend (clé chiffrée, adresse et nom d'expéditeur), validité des invitations, conservation RGPD (ligne unique, créée par upsert).
- Module `emails` : modèles écrits dans le code (invitation, relance, réinitialisation, test), transport Resend injectable, limite de 3 envois par heure et par destinataire.
- Scripts serveur `admin:creer` (premier super-admin, lien d'activation affiché une fois) et `admin:reinitialiser-totp` (double authentification perdue).
- Pages `(auth)` (connexion, double authentification, activation, mot de passe oublié, réinitialisation) et `(espace)` (accueil enseignant, administration des comptes et des paramètres).
- Tests d'intégration des modules `auth`, `comptes`, `parametres`, `emails` et `journal` (dont hachage et TOTP, vérifiés contre les vecteurs des RFC 4226, 6238 et 4648) ; tests de bout en bout de l'invitation et de l'activation d'un enseignant.

### Corrigé (vérification du lot)
- `admin:creer` acceptait des adresses que la connexion refuse (accents, tiret bas dans le domaine) : `normaliserEmail` utilise désormais la même regex que `z.email()`.
- La demande de réinitialisation répondait plus lentement pour un compte actif (écriture puis envoi), ce qui permettait d'énumérer les comptes : la recherche du compte et l'envoi s'exécutent maintenant après la réponse, avec `after()`.
- Aucun refus d'accès n'était journalisé alors que la spec l'exige : `journaliserLesRefus` écrit désormais `acces.refus` hors transaction pour chaque service à acteur.
- Un admin pouvait remplacer l'invitation d'un futur admin posée par le super-admin : le rôle de l'invitation en attente est maintenant contrôlé avant tout remplacement.
- Revue finale : liste des rôles de `schemaRole` reprise de `ROLES`, échec du hachage factice non mis en cache, aucun envoi réel possible depuis la suite d'intégration.

### Modifié
- `README.md` : lot 1 marqué livré, premier compte par `npm run admin:creer`, ordre d'installation, commandes d'administration, sécurité des comptes.
- `SECURITY.md` : prise de contrôle d'un compte ajoutée au périmètre des vulnérabilités.
- `docs/specs/2026-09-28-carreau-architecture-design.md` : §2, TOTP écrit dans le projet plutôt que `@oslojs/otp` (amendement A1).
- `docs/memory.md`, `docs/choix.csv` : décisions du plan du lot 1 (D1 à D13) et décisions prises pendant le run.

## 2026-09-28 — Lot 0 : socle technique

### Ajouté
- Projet Next.js 16 (TypeScript strict, standalone), ESLint avec frontières d'architecture, Prettier.
- Contrats d'erreur, enveloppes d'actions, de routes d'API et de pages ; lecture JSON bornée.
- Environnement validé au démarrage, chiffrement AES-256-GCM, IP client, horloge injectable.
- CSP à nonce (`src/proxy.ts`) et en-têtes de sécurité.
- Page d'accueil, pages 404 et d'erreur, jetons de design et polices auto-hébergées.
- PostgreSQL 17, Drizzle, migration initiale (limiteur, journal) ; limiteur générique, journal d'audit, point de santé.
- Tests unitaires, d'intégration (base isolée par fichier) et de bout en bout (ordinateur, iPhone, Android).
- Image Docker de production et intégration continue GitHub Actions.

### Corrigé (vérification et revue du lot)
- `executerPage` relance une erreur de remplacement porteuse de la seule référence : l'erreur d'origine, journalisée brute par Next, exposait les paramètres SQL.
- Tests d'intégration : seul `.env` est lu (plus de `.env.local` via `loadEnv`) et la base isolée est ciblée dès la collecte des tests.
- `error.tsx` utilise `retry` (rechargement des Server Components).
- Bases PostgreSQL de développement liées à `127.0.0.1` ; secret des purges vidé dans le serveur de bout en bout ; `.flotte` exclu du contexte Docker.

### Modifié
- `README.md` : état d'avancement, organisation du code et frontières, mesures de sécurité transverses, image Docker, feuille de route par lot (lot 0 livré).

## 2026-09-28 — Cadrage technique

### Ajouté
- `docs/specs/2026-09-28-carreau-architecture-design.md` : architecture, modèle de données, moteur d'examen, surveillance et indice, sécurité, tests, lots de livraison.

### Modifié
- `docs/memory.md` : renvoi vers le spec d'architecture, ports locaux réservés.
- `docs/choix.csv` : 14 décisions issues du cadrage.

## 2026-09-28 — Initialisation

### Ajouté
- `README.md` : présentation du projet, fonctionnement, principes anti-triche, données personnelles, architecture, feuille de route.
- `SECURITY.md` : politique de signalement des vulnérabilités et périmètre.
- `LICENSE` : licence MIT.
- `docs/memory.md` : modèle métier et règles structurantes.
- `docs/choix.csv` : choix techniques et fonctionnels initiaux.
- `.gitignore` adapté à Next.js, aux tests et à l’outillage local ; `.gitattributes` imposant les fins de ligne LF.
