# Journal des modifications

Toutes les évolutions notables de Carreau sont consignées ici, de la plus récente à la plus ancienne.

## 2026-09-29 — Lot 3 : éditeur de QCM

### Ajouté
- Dépendances validées (amendement A1 du spec §2 et §3.1) : `sharp` 0.35.5, `shiki` 4.4.3, `@shikijs/langs` 4.4.3 ; contrôle de signature d'image écrit dans le projet (PNG, JPEG, GIF, WebP) doublé du format détecté par `sharp`, plutôt que `file-type`.
- Règles partagées d'un QCM (`src/lib/regles-qcm.ts`, `points.ts`, `images.ts`, `vue-question.ts`) : types de question, bornes, `problemesQuestion` et `problemesQcm` (complétude), `decouperEnBlocs` (questions liées).
- Tables `qcm`, `question`, `proposition`, `image` et types énumérés PostgreSQL (`statut_qcm`, `origine_qcm`, `mode_chrono`, `type_question`).
- Module `images` (`signature`, `traitement`, `stockage`, `images`) : téléversement contrôlé (octets, `sharp`, orientation EXIF, ré-encodage WebP de 1 600 px sans métadonnées), lecture réservée au propriétaire ; routes `POST /api/enseignant/images` et `GET /api/images/[imageId]`.
- Module `qcm` (`commun`, `qcm`, `questions`, `code`, `apercu`) : création et statuts (brouillon, prêt, archivé), questions (ajout, enregistrement, suppression, déplacement par blocs, liaison), coloration du code par `shiki` côté serveur (jetons `{ texte, couleur }`), aperçu étudiant.
- Enregistrement automatique de l'éditeur (`src/lib/enregistreur.ts`, `EnregistreurDiffere`) : question entière envoyée 800 ms après la dernière frappe, vidange avant toute navigation ou action de l'éditeur, indicateur d'état.
- Pages `/enseignant/qcm` (liste, création), `/enseignant/qcm/[qcmId]` (éditeur : paramètres, questions, liaisons, barème, chrono) et `/enseignant/qcm/[qcmId]/apercu` (aperçu étudiant, composant `QuestionEtudiant` réutilisable au lot 5) ; lien « QCM » dans la navigation principale.
- Tests d'intégration des modules `qcm` et `images` ; tests unitaires des règles partagées ; tests de bout en bout de l'éditeur (`e2e/qcm.spec.ts`).

### Corrigé (vérification du lot)
- `EnregistreurDiffere` ne remettait pas seulement la dernière valeur prise en charge en attente après un échec : une ancienne valeur pouvait écraser la plus récente.
- Les tests de bout en bout tournaient depuis le dépôt et ne détectaient donc pas un paquet d'exécution manquant au build autonome (défaut de traçage de `shiki` découvert) : `e2e/serveur.mjs` démarre désormais une copie du build placée hors du dépôt, comme l'image Docker.
- L'onglet Paramètres masquait une durée en erreur (mode de chrono non choisi), empêchant l'enseignant de la corriger : elle s'affiche désormais quand elle porte une erreur.
- Dans l'aperçu, une réponse illustrée ne s'affichait pas en colonne quand les autres réponses n'avaient pas d'image.

### Modifié
- `README.md` : éditeur de QCM, questions liées, images et code dans l'architecture, images assainies et aucun HTML injecté, lot 3 marqué livré.
- `docs/memory.md` : QCM et images (lot 3), points à retenir pour les lots 4, 5, 8 et 10.
- `docs/choix.csv` : décisions A1, D4 à D8, D13 à D15 et D17 du plan du lot 3, et décisions prises pendant le run.
- `next.config.ts` : `images.unoptimized: true` ; traçage explicite des dépendances d'exécution de `shiki` (`PAQUETS_SHIKI`) dans `outputFileTracingIncludes`, à relever à chaque montée de version de shiki.

## 2026-09-29 — Lot 2 : classes

### Ajouté
- Module `classes` : création, renommage, archivage et restauration de classe ; propriété stricte par compte (`classe.enseignant_id`), invisible même du super-admin.
- Service des étudiants (`classes/etudiants.ts`) : ajout, modification, changement de tiers-temps et retrait un par un ; homonymes parfaits refusés par les noms normalisés (`src/lib/noms.ts`).
- Import de listes en trois étages (`import/lecture`, `import/archive`, `import/analyse`, `import/import`, `import/messages`) : fichier `.csv`/`.txt`, `.xlsx` ou texte collé, type décidé par les octets, CSV UTF-8 ou Windows-1252, séparateur détecté sur la ligne des titres, archive XLSX contrôlée par `fflate` avant lecture (`read-excel-file`).
- Aperçu de l'import (`analyserImport`) détaillant chaque ligne rejetée et son motif, avant confirmation qui revalide entièrement les lignes (`importerEtudiants`).
- Verrou `SELECT … FOR UPDATE` sur la classe pour toute écriture (renommage, archivage, ajout, tiers-temps, retrait, import).
- Ressource d'un autre compte journalisée en `acces.refus` (`erreurs.ressourceAutrui`, marqueur `refusAcces`), via `journaliserLesRefus`.
- Pages `/enseignant/classes` (liste et création) et `/enseignant/classes/[classeId]` (classe choisie, étudiants, import) ; lien « Classes » dans la navigation principale pour tous les rôles.
- Dépendances validées (amendement A1 du spec §3.1) : `papaparse`, `read-excel-file`, `fflate` ; en développement `@types/papaparse` et `write-excel-file` (fabrique les classeurs des tests, passera en dépendance au lot 7). `exceljs` écarté (vulnérabilités, paquet non maintenu).
- Tests d'intégration des modules `classes`, `etudiants` et `import/*` ; tests de bout en bout de l'import d'une liste de 30 étudiants avec rejets expliqués.

### Corrigé (revue du lot)
- La normalisation des noms laissait passer les apostrophes ‘ et ´ et les caractères invisibles (trait d'union conditionnel, espace de largeur nulle) : un nom copié d'un document échappait à la détection des homonymes et à la recherche.
- La clé d'homonymie séparait nom et prénom par « | » : deux couples différents pouvaient donner la même clé ; elle est désormais `JSON.stringify([nom, prénom])` normalisés (`cleNormalisee`).
- Deux créations de classe simultanées pouvaient dépasser la limite de 200 classes : la création verrouille désormais la ligne du compte.
- Des caractères invisibles étaient écrits en clair dans des expressions régulières (`src/lib/noms.ts`, `import/lecture.ts`) : remplacés par des échappements `\u`.

### Modifié
- `README.md` : classes et import de listes, bibliothèques d'import, imports bornés, lot 2 marqué livré.
- `docs/memory.md` : propriété des classes, import en trois étages, points à retenir pour les lots 4 et 7.
- `docs/choix.csv` : décisions A1 et D2 à D16 du plan du lot 2.

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
