# Journal des modifications

Toutes les évolutions notables de Carreau sont consignées ici, de la plus récente à la plus ancienne.

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
