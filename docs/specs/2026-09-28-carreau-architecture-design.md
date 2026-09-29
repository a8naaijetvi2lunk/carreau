# Carreau — architecture technique

> Spec de conception, 28 septembre 2026. Document de référence pour tous les lots de livraison.
> Le périmètre fonctionnel est décrit dans le [README](../../README.md) et les règles métier dans [`docs/memory.md`](../memory.md) ; ce document fixe **comment** les réaliser.

## 1. Décisions actées

### 1.1 Produit (validées avec l'auteur)

| Sujet | Décision |
| --- | --- |
| Publics | Étudiants majeurs sur téléphone personnel, sans compte ; enseignants sur invitation ; rôles `super_admin`, `admin`, `enseignant`. |
| Entrée étudiant | Code de session renouvelé toutes les 30 s (QR code projeté), 3 lettres du nom, choix dans la liste de la classe, téléphone lié à l'étudiant. |
| Démarrage | Salle d'attente, démarrage commun. Aucune entrée après le démarrage ; l'enseignant ouvre une session de rattrapage, dont les résultats rejoignent ceux de la classe. |
| Mélange | Questions mélangées par blocs (une chaîne de questions liées garde son ordre et reste consécutive) ; réponses toujours mélangées ; par étudiant. |
| Chrono | Aucun, global ou par question, tenu par le serveur. Tiers-temps. À l'échéance, la dernière sélection enregistrée est validée. Reprise après coupure, le temps continue. |
| Notation | Choix multiples en **tout ou rien**. Barème par question : bonne réponse, mauvaise réponse (peut être négative), sans réponse. |
| Anti-triche | Événements bruts horodatés côté serveur, agrégés en un indice de suspicion 0-100 réservé aux enseignants, jamais présenté comme une preuve. Vocabulaire non accusateur côté étudiant. |
| Sécurité des comptes | Double authentification TOTP **obligatoire pour tous les comptes**. |
| MCP | Jeton par enseignant, révocable ; accès aux brouillons de QCM et aux noms des classes uniquement. |
| Conservation | Durées laissées vides à l'installation et renseignées par le super-admin. |
| PWA | Installable, facultative ; le lien du QR code fonctionne dans le navigateur sans installation. |
| Dépôt | Public, licence MIT. |

### 1.2 Décisions de conception prises dans ce document

Chacune est détaillée dans sa section.

1. **Figer le contenu à la session** : au démarrage, le QCM est copié dans la session (instantané). Les résultats et rapports lisent l'instantané ; le QCM reste modifiable pour les sessions suivantes (§4.3).
2. **Échéances appliquées par le serveur, sans minuterie** : tout accès à une session rattrape les échéances dépassées, y compris pour un étudiant dont le téléphone s'est éteint (§6.5).
3. **Tolérance réseau de 3 s** sur une validation reçue après l'échéance (§6.5).
4. **Note** : total borné à 0, ramené sur 20, arrondi au centième, affiché avec virgule (§6.6).
5. **Tiers-temps** : durées multipliées par 4/3, arrondies à la seconde supérieure (§6.5).
6. **« Prolonger »** : disponible en chrono global uniquement ; masqué en chrono par question et sans chrono (§6.5).
7. **Recherche de nom** : insensible à la casse et aux accents, sur le début du nom ou du prénom ; homonymes parfaits refusés à l'import (§6.2).
8. **Évolution d'un étudiant** : participations de la même fiche étudiant (même classe) chez le même enseignant (§8.4).
9. **Modèles d'e-mails** : écrits dans le code, avec envoi de test ; pas d'édition en base (§9.3). Le bouton « Modifier » des maquettes est retiré.
10. **Paramètres RGPD vides** : le lancement d'une session est refusé tant que les durées de conservation et le contact ne sont pas renseignés (§9.4).
11. **Récupération TOTP** : un admin réinitialise le TOTP d'un enseignant ; le super-admin passe par un script serveur (§9.2).
12. **Temps réel par interrogation régulière** (polling), sans flux continu (§7).
13. **Scanner de QR code intégré** à la PWA, dans le dernier lot fonctionnel (§12, lot 9).

## 2. Décisions héritées de DevBrain

Appliquées sans nouvelle discussion. Source principale : le projet voisin « Plateforme iut-tc », en production depuis septembre 2026 avec la même stack (fiche d'architecture du 17/09/2026 et son `choix.csv`).

| Décision | Source |
| --- | --- |
| Code organisé en modules par domaine ; droits vérifiés **uniquement dans les services**, qui reçoivent l'acteur en premier paramètre ; pages, actions, API et MCP appellent les mêmes services | Architecture iut-tc |
| Refus d'accès rendu en 404 | `choix.csv` iut-tc |
| Authentification maison : argon2id (`@node-rs/argon2`), sessions en base (jeton 256 bits haché SHA-256), cookie `__Host-`, TOTP écrit dans le projet (RFC 4226 et 6238, `node:crypto` ; `@oslojs/otp` écarté le 29/09/2026, paquet signalé par npm) avec anti-rejeu, secret chiffré AES-256-GCM, premier compte créé par script | Architecture iut-tc ; notes « better-auth : limiteur IP partagé derrière nginx » (26/08/2026) et « better-auth : la réinitialisation ne révoque pas sessions ni jetons » (28/07/2026) |
| Limiteur en table SQL, clés séparées par compte, IP et rôle ; la salle entière partage une IP ; IP lue dans `X-Real-IP`, sinon la **dernière** valeur de `X-Forwarded-For` | Architecture iut-tc ; note « limiteur IP partagé derrière nginx » |
| Temps réel par polling, pas de WebSocket ni SSE derrière Nginx Proxy Manager | `choix.csv` iut-tc |
| Routes d'API (et non Server Actions) pour les écritures fréquentes : Next met en file les actions d'un même client | `choix.csv` iut-tc |
| CSRF : contrôle d'origine des Server Actions, cookies `SameSite=Lax`, `Content-Type: application/json` exigé sur les routes d'API | Architecture iut-tc |
| CSP à nonce dans `proxy.ts` ; autres en-têtes dans `next.config.ts` ; HSTS non posé par le proxy | Architecture iut-tc ; notes « en-têtes de sécurité : appli vs proxy » (22/04/2026), « HSTS en double » (22/04/2026) |
| Cookie `Secure` et redirections HTTPS dépendant du protocole réel (`X-Forwarded-Proto`), pas de `NODE_ENV` | Note « durcissement HTTPS invisible sur localhost » (27/08/2026) |
| Fichiers : volume Docker, envoi en flux, type vérifié sur les octets (`file-type`), nom UUID, service par route contrôlée (`nosniff`, `private, no-store`) ; SVG refusé | Architecture iut-tc ; note « upload SVG : sécurité » (10/06/2026) |
| Paquets natifs ou dynamiques (`file-type`, `sharp`) en `serverExternalPackages` et présence vérifiée dans `instrumentation.ts` | Note « Next standalone : `strtok3` absent » (17/09/2026) |
| Drizzle + node-postgres (`Pool`), migrations générées et relues, appliquées au démarrage du conteneur | Architecture iut-tc |
| Pièges Drizzle : colonnes déqualifiées sans jointure, `Date` brute dans `sql`, `sum(bigint)` en chaîne | Note « Drizzle déqualifie les colonnes sans jointure » (26/08/2026) |
| MCP : `mcp-handler` 2 avec `@modelcontextprotocol/server` 2 ; jeton Bearer vérifié avant `withMcpAuth` ; jetons hachés à portée ; corps limité ; appels journalisés sans arguments | Architecture iut-tc |
| Clé d'API saisie dans l'interface chiffrée en AES-256-GCM | Note « chiffrer un secret conservé en base » (29/08/2026) |
| Resend : le SDK ne lève pas d'exception, toujours lire `{ error }` ; adresse et nom d'expéditeur séparés ; limite par destinataire | Notes « Resend SDK v6 : erreur silencieuse » (29/04/2026), « anti-relais e-mail » (18/04/2026) |
| Service worker en réseau d'abord ; type MIME du manifeste déclaré | Notes « anciennes versions après mise en ligne : service worker » (23/09/2026), « manifeste servi en octet-stream » (11/09/2026) |
| Tests : Vitest unitaires et intégration séparés, Postgres Docker dédié avec base modèle clonée par fichier, matrice des refus d'accès, Playwright sur le build standalone | Architecture iut-tc |
| Horloges de test à des valeurs réalistes (≈ 1,7 × 10¹²) | Note « horloge de test irréaliste » (21/08/2026) |
| Déploiement : Dockerfile trois étapes, `output: 'standalone'`, migrations puis `server.js`, healthcheck sur `127.0.0.1`, `HOSTNAME=0.0.0.0` | Architecture iut-tc ; note « healthcheck Docker et IPv6 » (16/09/2026) |
| `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` fixée au build et stable : un redéploiement en plein examen ne doit rien casser | Note « Server Action introuvable » (22/04/2026) |
| Nginx Proxy Manager est le seul point d'entrée (Traefik arrêté) ; `Host $http_host` obligatoire ; `proxy_buffering off` sur `/api/mcp` | Notes « infrastructure Coolify » (27/09/2026), « `$host` casse les Server Actions » (26/08/2026) |
| Purges par tâche planifiée Coolify (fréquence en UTC) appelant une route protégée par `CRON_SECRET` | Note « tâche planifiée Coolify » (17/09, mise à jour 24/09/2026) |
| Un lot transverse a un intégrateur désigné et des critères de vérification portant sur des comportements | Note « vague multi-agents : désigner un intégrateur » (17/09/2026) |

**Écart assumé** : iut-tc a renoncé à un score global parce que le navigateur est falsifiable. Carreau conserve un indice, demandé explicitement, sous trois garde-fous : c'est un signal et non une preuve, le détail du calcul est toujours visible, les événements bruts sont conservés et l'indice est recalculable.

## 3. Architecture générale

### 3.1 Vue d'ensemble

Une application Next.js 16 unique, en **une seule instance**. Tout l'état vit dans PostgreSQL : aucune donnée métier en mémoire, ce qui laisse la porte ouverte à plusieurs instances plus tard sans refonte.

```
Téléphone étudiant ──┐
Poste enseignant ────┼──► Nginx Proxy Manager ──► Carreau (Next.js standalone) ──► PostgreSQL 17
Assistant IA (MCP) ──┘                                  │
                                                        ├──► Volume images (/data/images)
                                                        └──► Resend (e-mails)
```

| Élément | Choix |
| --- | --- |
| Exécution | Node 24, Next.js 16 (App Router), React 19, TypeScript strict, npm |
| Interface | Tailwind CSS 4 ; jetons de design repris des maquettes ; polices auto-hébergées par `next/font` (Bricolage Grotesque, Atkinson Hyperlegible, JetBrains Mono) |
| Données | PostgreSQL 17, Drizzle ORM, node-postgres |
| Validation | Zod 4 (`z.strictObject` sur toutes les entrées) |
| Images | `file-type` (contrôle), `sharp` (ré-encodage WebP) |
| Code dans les questions | `shiki` côté serveur, en jetons (jamais de HTML injecté) |
| QR code | `qrcode`, correction d'erreur Q |
| Import / export | `papaparse` (CSV et collage), `exceljs` (XLSX) |
| Scanner intégré | `qr-scanner` (lot 9) |

### 3.2 Arborescence

```
src/
  app/
    (public)/            accueil, rejoindre, examen (écrans étudiant)
    (auth)/              connexion, activation, double authentification, réinitialisation
    enseignant/          accueil, qcm, classes, sessions, résultats, mcp
    admin/               enseignants, paramètres
    api/
      etudiant/          rejoindre, recherche, reclamer, etat, selection, reponse, evenements
      enseignant/        sessions/[id]/suivi, sessions/[id]/projection
      images/[id]/       service contrôlé des images
      mcp/               serveur MCP
      cron/purges/       purges RGPD
      sante/             healthcheck
  modules/               un dossier par domaine, index.ts public
    auth/  comptes/  parametres/  classes/  qcm/  images/  sessions/
    examen/  surveillance/  resultats/  mcp/  journal/  limiteur/  sante/  purges/
  moteur/                logique pure, sans I/O : melange, notation, echeances, indice, code-session, recherche
  db/schema/             un fichier par domaine
  lib/                   erreurs, journal-erreur, action, reponse-api, page, env, horloge, ip, chiffrement, csp (sans accès à la base)
  components/ui/         composants partagés
scripts/                 migrer, admin-creer, admin-reinitialiser-totp, purger
drizzle/                 migrations SQL versionnées
e2e/                     Playwright
```

**Frontières** (vérifiées par `eslint-plugin-boundaries`, motifs en `src/x/**` et contrôlées par un import volontairement interdit, cf. piège noté dans DevBrain) :

- `app` n'importe que `modules/*/index.ts`, `lib` et `components`.
- `modules` n'importe jamais `app` ; un module n'importe un autre module que par son `index.ts`.
- `moteur` n'importe rien d'autre que `lib/erreurs` et Zod : il est testable sans base.
- Les composants client n'importent aucun module serveur (`server-only`).

### 3.3 Contrats partagés

- `lib/erreurs.ts` : `ErreurService` avec un code (`NON_CONNECTE` 401, `ACCES_REFUSE` 403, `INTROUVABLE` 404, `VALIDATION` 422, `ETAT` 409, `CONFLIT` 409, `LIMITE_ATTEINTE` 429), repris d'iut-tc. Une ressource d'autrui lève `INTROUVABLE` (on ne révèle pas qu'elle existe) ; un rôle insuffisant lève `ACCES_REFUSE`, rendu en 404 dans les pages.
- `lib/action.ts` : enveloppe des Server Actions (validation Zod, acteur, conversion des erreurs).
- `lib/reponse-api.ts` : enveloppe des routes d'API (JSON exigé, limiteur, conversion des erreurs, `Cache-Control: no-store`).
- `lib/horloge.ts` : horloge injectable ; **aucun appel direct à `Date.now()`** dans `modules` et `moteur`.
- `lib/env.ts` : variables d'environnement validées par Zod, vérifiées au démarrage dans `instrumentation.ts`.

Variables d'environnement (noms) : `DATABASE_URL`, `DATABASE_URL_TEST`, `APP_URL`, `CHIFFREMENT_CLE`, `IMAGES_DIR`, `CRON_SECRET`, `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`, `NODE_ENV`, `PORT`, `HOSTNAME`.

## 4. Modèle de données

Noms de tables et de colonnes en français, `snake_case`. Identifiants UUID v4 (`gen_random_uuid()`), sauf `evenement` (bigserial) ; les tris se font sur les dates. Toutes les dates en `timestamptz` ; affichage en `Europe/Paris`.

### 4.1 Comptes et administration

| Table | Colonnes principales | Contraintes |
| --- | --- | --- |
| `utilisateur` | `email`, `nom`, `prenom`, `role` (`super_admin`, `admin`, `enseignant`), `mot_de_passe_hash`, `totp_secret_chiffre`, `totp_dernier_pas`, `actif`, `cree_le`, `derniere_connexion_le` | `email` unique en minuscules |
| `session_connexion` | `utilisateur_id`, `jeton_hash`, `cree_le`, `derniere_activite_le`, `expire_le`, `double_auth_validee` | `jeton_hash` unique |
| `invitation` | `email`, `role`, `jeton_hash`, `invite_par`, `expire_le`, `utilisee_le`, `annulee_le` | une seule invitation active par e-mail |
| `jeton_reinitialisation` | `utilisateur_id`, `jeton_hash`, `expire_le`, `utilise_le` | usage unique, 1 h |
| `parametres` | ligne unique : `resend_cle_chiffree`, `email_expediteur`, `nom_expediteur`, `validite_invitation_jours` (7), `conservation_evenements_jours`, `conservation_resultats_jours`, `contact_donnees` | les trois derniers nullables |
| `limiteur` | `cle`, `compteur`, `fenetre_debut`, `bloque_jusqu_au` | `cle` unique |
| `journal` | `acteur_type`, `acteur_id`, `action` (`domaine.verbe`), `cible`, `details`, `cree_le` | jamais de secret ni de donnée de réponse |
| `jeton_mcp` | `enseignant_id`, `nom`, `prefixe`, `jeton_hash`, `portee` (`lecture`, `ecriture`), `cree_le`, `dernier_usage_le`, `revoque_le` | `jeton_hash` unique |

### 4.2 Classes et QCM

| Table | Colonnes principales | Contraintes |
| --- | --- | --- |
| `classe` | `enseignant_id`, `nom`, `archivee` | `(enseignant_id, nom)` unique |
| `etudiant` | `classe_id`, `nom`, `prenom`, `nom_normalise`, `prenom_normalise`, `tiers_temps` | `(classe_id, nom_normalise, prenom_normalise)` unique |
| `qcm` | `enseignant_id`, `titre`, `statut` (`brouillon`, `pret`, `archive`), `origine` (`interface`, `mcp`), `mode_chrono` (`aucun`, `global`, `par_question`), `duree_globale_s`, `duree_question_s`, `note_visible_defaut`, `correction_visible_defaut`, `modifie_le` | — |
| `question` | `qcm_id`, `position`, `type` (`unique`, `multiple`, `vrai_faux`), `enonce`, `image_id`, `code_langage`, `code_source`, `points_bonne`, `points_mauvaise`, `points_vide`, `duree_s` (surcharge facultative), `liee_a_suivante` | `(qcm_id, position)` unique |
| `proposition` | `question_id`, `position`, `texte`, `image_id`, `correcte` | au moins un texte ou une image |
| `image` | `enseignant_id`, `largeur`, `hauteur`, `octets`, `cree_le` | fichier `IMAGES_DIR/<id>.webp` |

Règles vérifiées par le service `qcm` (et non par la base) : une seule proposition correcte pour `unique` et `vrai_faux` (exactement deux propositions pour ce dernier), au moins une pour `multiple` ; 2 à 8 propositions ; énoncé 1 à 2 000 caractères ; code 0 à 4 000 caractères, langage dans une liste blanche ; un QCM passe en `pret` seulement si toutes ses questions sont valides.

La **liaison** est portée par `liee_a_suivante` sur la question du dessus. « Lier à la question du dessous » la pose sur la question courante, « lier à celle du dessus » sur la précédente. Une chaîne de liaisons forme un bloc.

### 4.3 Sessions et passage de l'examen

| Table | Colonnes principales | Contraintes |
| --- | --- | --- |
| `session_examen` | `qcm_id`, `classe_id`, `enseignant_id`, `type` (`classe`, `rattrapage`), `session_origine_id`, `statut` (`attente`, `en_cours`, `terminee`, `annulee`), `code_secret`, `contenu` (instantané JSONB), `creneau_prevu_le`, `demarre_le`, `fin_prevue_le`, `termine_le`, `note_visible`, `correction_visible` | — |
| `session_autorisation` | `session_id`, `etudiant_id` | rattrapage uniquement |
| `participation` | `session_id`, `etudiant_id`, `appareil_jeton_hash`, `statut` (`attente`, `en_cours`, `terminee`), `ordre` (JSONB), `index_courant`, `question_servie_le`, `echeance_question_le`, `echeance_globale_le`, `information_lue_le`, `rejointe_le`, `terminee_le`, `dernier_contact_le`, `points`, `note_sur_20`, `indice`, `indice_version`, `indice_detail` | `(session_id, etudiant_id)` unique |
| `reponse` | `participation_id`, `question_cle`, `selection_brouillon`, `selection`, `validee_le`, `origine` (`validation`, `echeance`, `fin`), `points` | `(participation_id, question_cle)` unique |
| `evenement` | `participation_id`, `type`, `recu_le`, `duree_ms`, `question_index`, `details` | index `(participation_id, recu_le)` |
| `demande_appareil` | `participation_id`, `motif` (`second_appareil`, `reprise`), `jeton_hash`, `statut` (`en_attente`, `autorisee`, `refusee`, `expiree`), `cree_le`, `traitee_le`, `traitee_par` | une seule en attente par participation |

**Instantané** : au démarrage, le service copie dans `session_examen.contenu` le QCM complet (questions, propositions, bonnes réponses, barème, durées), validé par un schéma Zod, avec des **clés de question stables** (`question_cle`). Tant que la session est en `attente`, l'enseignant peut encore modifier le QCM ou changer la classe. Après le démarrage, résultats, corrections et rapports ne lisent que l'instantané. Le QCM d'origine reste modifiable pour les sessions suivantes ; il ne peut être supprimé que par archivage.

Une session de **rattrapage** reprend l'instantané de sa session d'origine (et non le QCM du moment) : les notes restent comparables et ses participations s'affichent dans les résultats de la session d'origine.

**Fin prévue** (`fin_prevue_le`) : en chrono global, démarrage + durée × facteur le plus élevé de la liste ; en chrono par question, démarrage + somme des durées × facteur le plus élevé ; sans chrono, aucune (la session se termine quand tous ont fini ou sur décision de l'enseignant).

## 5. Authentification et comptes

- **Premier compte** : `npm run admin:creer -- <email>` crée le super-admin et affiche un lien d'activation à usage unique (Resend n'est pas encore configuré). Ordre d'installation : créer le super-admin, l'activer (mot de passe + TOTP), renseigner Resend et les paramètres RGPD, inviter.
- **Invitation** : lien à usage unique, valable `validite_invitation_jours` (7 par défaut), jeton en base haché. « Relancer » révoque l'ancien lien et en émet un nouveau. L'activation fait choisir un mot de passe (12 caractères minimum) puis enrôle le TOTP.
- **Connexion** : e-mail + mot de passe, puis code TOTP. La session n'est pleinement valide qu'après la double authentification (`double_auth_validee`). Durée : 12 h au maximum, 30 min d'inactivité (le polling du tableau de bord compte comme activité) ; option « Rester connecté » à 30 jours sur un appareil personnel.
- **Réinitialisation du mot de passe** : lien d'une heure, usage unique ; révoque toutes les sessions de l'utilisateur. Le TOTP est conservé.
- **Désactivation** : révoque immédiatement sessions et jetons MCP ; les données de l'enseignant sont conservées et redeviennent accessibles à la réactivation.
- **Droits** : l'admin gère les comptes enseignants (inviter, relancer, désactiver, réinitialiser le TOTP) mais ne voit pas leurs contenus. Le super-admin gère en plus les rôles et les paramètres. Un enseignant ne voit que ses classes, QCM, sessions et résultats.

## 6. Parcours étudiant et moteur d'examen

### 6.1 Code de session

- Chaque session a un `code_secret` aléatoire. Le code affiché vaut `HMAC-SHA256(code_secret, ⌊t / 30 s⌋)`, tronqué à 6 caractères en base32 de Crockford (sans I, L, O, U), affiché « K7M 4QP ».
- Sont acceptés le code de la fenêtre courante et celui de la précédente (validité effective : 30 à 60 s).
- Le QR code pointe vers `/rejoindre#K7M4QP` : le code reste dans le fragment d'URL, jamais dans les journaux du proxy ; la page l'envoie en POST.
- Un code n'est accepté que si la session est en `attente`.

### 6.2 Rejoindre

1. `POST /api/etudiant/rejoindre { code }` : le serveur vérifie le code et pose un **ticket d'entrée** (cookie `__Host-carreau-entree`, signé, lié à la session, 10 min), pour que la suite ne dépende plus du code qui tourne.
2. `POST /api/etudiant/recherche { debut }` (3 caractères minimum) : renvoie au plus 8 étudiants de la classe (ou de la liste de rattrapage) dont le nom **ou** le prénom normalisé commence par la saisie. Normalisation : minuscules, accents retirés (NFD), espaces et tirets unifiés.
3. `POST /api/etudiant/reclamer { etudiantId }` :
   - aucune participation : création, génération d'un jeton d'appareil (256 bits) posé en cookie `__Host-carreau-participation` (`HttpOnly`, `Secure`, `SameSite=Lax`), seul son hachage est stocké ;
   - participation existante avec le même jeton : reprise ;
   - participation existante avec un autre jeton : création d'une `demande_appareil` (`second_appareil` avant le démarrage, `reprise` après) et d'un événement sur la participation d'origine. Le téléphone patiente jusqu'à la décision de l'enseignant ; s'il autorise, l'ancien jeton est révoqué.
4. Écran d'information : sa lecture est enregistrée (`information_lue_le`) avant l'entrée en salle d'attente.

Après le démarrage, `rejoindre` refuse toute nouvelle participation (« La session a démarré. Préviens ton enseignant. ») ; seules les demandes d'appareil sur une participation existante restent possibles.

Les homonymes parfaits dans une classe sont refusés à l'import ; l'enseignant les distingue (initiale, second prénom).

### 6.3 Démarrage commun

- « Démarrer » fixe `demarre_le = maintenant + 5 s`. Les téléphones, qui interrogent le serveur toutes les 2 s, affichent un compte à rebours calé sur l'heure du serveur (chaque réponse porte `serveur_maintenant`) : tout le monde commence au même instant.
- Au démarrage, le service prend l'instantané, calcule pour chaque participation son **ordre** (mélange par blocs puis mélange des propositions, graine aléatoire par participation) et ses échéances.

### 6.4 Déroulé d'une question

- `POST /api/etudiant/etat` renvoie la vue courante : énoncé, image (URL contrôlée), code en jetons colorés, propositions dans l'ordre de l'étudiant avec des identifiants opaques, type, rang et total, échéances, `serveur_maintenant`. **Jamais** l'indicateur `correcte`, jamais la question suivante.
- `POST /api/etudiant/selection { rang, selection }` enregistre la sélection en cours à chaque touche (`selection_brouillon`), uniquement pour la question courante.
- `POST /api/etudiant/reponse { rang, selection }` valide : transaction avec verrou de ligne sur la participation (`SELECT … FOR UPDATE`), contrôle que `rang` est la question courante et que l'échéance n'est pas dépassée (tolérance incluse), enregistrement, calcul des points, passage à la question suivante, calcul de sa nouvelle échéance. Une validation rejouée pour un rang déjà validé renvoie l'état courant sans rien modifier (idempotence).
- Aucun retour en arrière : le serveur ne sert que la question courante.

### 6.5 Échéances, tiers-temps et reprise

- **Chrono global** : `echeance_globale_le = demarre_le + durée × facteur`, avec facteur 4/3 pour un étudiant en tiers-temps (arrondi à la seconde supérieure).
- **Chrono par question** : `echeance_question_le = question_servie_le + durée de la question × facteur`.
- **Rattrapage des échéances** : la fonction pure `moteur/echeances.appliquer(participation, maintenant)` valide les questions échues avec leur dernière sélection enregistrée (`origine = echeance`), passe aux suivantes, et clôt la participation quand l'échéance globale ou la dernière question est atteinte (questions restantes sans réponse, `origine = fin`). Elle est appelée avant toute lecture ou écriture d'une participation, et pour toutes les participations d'une session à chaque interrogation du tableau de bord, à chaque lecture des résultats et à la clôture. Un étudiant dont le téléphone s'est éteint est donc clos correctement sans qu'il revienne.
- **Tolérance réseau** : une validation reçue jusqu'à 3 s après l'échéance est acceptée ; au-delà, la sélection enregistrée fait foi.
- **Reprise** : même appareil, reprise directe ; autre appareil, demande à l'enseignant. Le temps a continué de courir pendant la coupure.
- **Prolonger** (chrono global uniquement) : ajoute la durée choisie à `fin_prevue_le` et à l'échéance globale de chaque participation en cours.
- **Terminer pour tous** : clôt toutes les participations comme à l'échéance globale.
- **Clôture automatique** : une session dont toutes les participations sont terminées, ou dont la fin prévue est passée de 10 min, passe en `terminee`. Sans chrono, seule la première condition ou « Terminer pour tous » la clôt.

### 6.6 Notation

- `unique` et `vrai_faux` : la proposition choisie est la bonne → `points_bonne` ; une autre → `points_mauvaise` ; aucune → `points_vide`.
- `multiple` : l'ensemble coché est exactement l'ensemble correct → `points_bonne` ; ensemble non vide différent → `points_mauvaise` ; aucune case → `points_vide`.
- Total = somme des points, borné à 0 ; note = total ÷ somme des `points_bonne` × 20, arrondie au centième, affichée avec une virgule (« 14,5 »).
- Tout le calcul est fait dans `moteur/notation`, sur l'instantané.

### 6.7 Mélange

`moteur/melange` : la liste des questions est découpée en blocs (une chaîne `liee_a_suivante` forme un bloc), les blocs sont mélangés (Fisher-Yates, graine par participation), l'ordre interne d'un bloc est conservé ; les propositions de chaque question sont mélangées indépendamment. L'ordre calculé est stocké dans `participation.ordre`, ce qui rend la correction et le rapport reproductibles.

## 7. Temps réel

| Écran | Appel | Période |
| --- | --- | --- |
| Téléphone en salle d'attente | `POST /api/etudiant/etat` | 2 s |
| Téléphone pendant l'examen | `POST /api/etudiant/etat` (sert aussi de battement) | 5 s, et à chaque retour au premier plan |
| Écran projeté | `POST /api/enseignant/sessions/[id]/projection` (code courant, secondes restantes, connectés) | 2 s |
| Tableau de bord (ordinateur et téléphone) | `POST /api/enseignant/sessions/[id]/suivi` (participants, compteurs, alertes et demandes d'appareil) | 3 s |

Les interrogations sont suspendues quand l'onglet enseignant est masqué, jamais côté étudiant. Charge attendue pour 30 étudiants : moins de 20 requêtes par seconde, négligeable. Toutes les réponses sont en `no-store`.

## 8. Surveillance et indice

### 8.1 Hypothèse de menace

Le dépôt est public : **l'étudiant peut lire le code**, y compris la pondération de l'indice. La sécurité ne repose sur aucun secret de conception. Un navigateur ne peut pas verrouiller un téléphone ; l'objectif est de rendre les écarts visibles, pas de les empêcher tous.

### 8.2 Signaux

Les signaux **primaires** sont observés par le serveur et ne peuvent pas être supprimés par le téléphone :

- **silence** : aucun contact pendant plus de 15 s alors que la participation est en cours ;
- **temps de réponse** : validation très rapide juste après un retour ;
- **second appareil** : réclamation du même nom depuis un autre téléphone ;
- **rechargement** : chargement de la page d'examen sur une participation déjà en cours (fréquent sur iOS, qui peut recharger une page restée en arrière-plan).

Les signaux **complémentaires** viennent du navigateur et peuvent manquer :

- `visibilitychange` et `pagehide` (sortie de l'application ou de l'onglet) ;
- `blur` et `focus` (notification, centre de contrôle) ;
- `copy`, `cut`, `paste` ;
- redimensionnement marqué pendant que la page est visible (**heuristique** d'écran partagé, faible poids) ;
- `online` et `offline`, échecs de requêtes (coupure réseau).

Le module client `modules/surveillance/client` numérote les transitions, les met en file et les envoie par `POST /api/etudiant/evenements` (lots de 50 au plus, `fetch` avec `keepalive`, `sendBeacon` sur `pagehide`).

### 8.3 Règles de consolidation

- La **durée** d'une absence est toujours mesurée par le serveur : écart entre le dernier contact avant et le premier contact après. Le téléphone n'indique que la **nature** de l'absence (page masquée ou réseau coupé).
- Une absence que le téléphone déclare comme coupure réseau, sans passage en page masquée, n'entre pas dans l'indice. Elle reste visible dans la chronologie de l'enseignant (« coupure réseau »).
- Un silence sans explication du téléphone compte comme une sortie de même durée.

### 8.4 Indice v1

Fonction pure `moteur/indice.calculer(evenements, reponses, ponderation) → { valeur, detail }`. La pondération porte un numéro de version, stocké avec l'indice ; changer la pondération n'efface rien, l'indice est recalculable à partir des événements bruts.

| Signal | Points (pondération v1) |
| --- | --- |
| Sortie (page masquée ou silence inexpliqué) | 1 par seconde, minimum 5, maximum 45 par sortie |
| Perte de focus d'au moins 2 s sans sortie | 6 |
| Copier, couper ou coller | 10 |
| Réponse validée moins de 10 s après le retour d'une sortie d'au moins 5 s | 12 |
| Tentative depuis un second appareil | 20 |
| Écran partagé (heuristique) | 5 |
| Coupure réseau déclarée, page visible | 0 |
| Rechargement de la page | 0 (contexte affiché dans la chronologie) |

Total borné à 100. Cette pondération est une **calibration initiale**, à revoir après les premières sessions réelles. Les comportements observés sur iOS et Android seront documentés à ce moment-là.

Le rapport étudiant présente le détail (une ligne par signal, nombre, contribution), la chronologie complète et l'**évolution** : note et indice de chaque participation de la même fiche étudiant (même classe), chez le même enseignant.

Côté étudiant, aucun indice n'est affiché. Au retour d'une sortie, un bandeau neutre indique la durée notée (« Tu as quitté l'examen pendant 38 s, c'est noté »).

## 9. Espaces enseignant et administration

### 9.1 Enseignant

- **Classes** : création, import (CSV ou XLSX, ou liste collée depuis un tableur), aperçu avant enregistrement avec les lignes rejetées et leur motif, tiers-temps par étudiant.
- **QCM** : éditeur conforme aux maquettes. Images : téléversement, contrôle du type réel (PNG, JPEG, WebP, GIF non animé), ré-encodage WebP de 1 600 px au plus, métadonnées supprimées, 5 Mo maximum à l'entrée. Aperçu étudiant.
- **Sessions** : création (QCM prêt, classe, créneau facultatif, visibilité de la note et de la correction reprises du QCM et modifiables), liste des sessions, écran projeté, tableau de bord, rattrapage depuis un absent des résultats.
- **Résultats** : tableau (participations de la session et de ses rattrapages, ces dernières marquées « Rattrapage »), exports CSV (UTF-8 avec BOM, séparateur `;` pour Excel en français) et XLSX (une feuille de synthèse, une feuille par question), rapport étudiant.
- **Correction côté étudiant** : si `correction_visible`, l'étudiant la consulte sur son téléphone après la fin de la session, avec le même appareil.

### 9.2 Administration

- Liste des comptes, invitations, relances, désactivation, réactivation, réinitialisation du TOTP (l'enseignant ré-enrôle à la connexion suivante ; ses sessions sont révoquées).
- Rôles modifiables par le super-admin uniquement. Il reste toujours au moins un super-admin actif.
- Le super-admin qui perd son TOTP utilise `npm run admin:reinitialiser-totp -- <email>` sur le serveur.

### 9.3 E-mails

Resend, clé chiffrée en base, adresse et nom d'expéditeur séparés et validés. Modèles écrits dans le code (invitation, relance, réinitialisation du mot de passe) avec envoi de test depuis les paramètres. Limite : 3 envois par heure et par destinataire. Toute erreur Resend est journalisée et remontée à l'écran.

### 9.4 Paramètres RGPD

Tant que `conservation_evenements_jours`, `conservation_resultats_jours` et `contact_donnees` ne sont pas renseignés, le lancement d'une session est refusé avec un message explicite, et un bandeau le signale au super-admin. L'écran d'information étudiant affiche toujours des valeurs réelles, jamais de texte provisoire.

## 10. Serveur MCP

- Route `/api/mcp`, `createMcpHandler` en Streamable HTTP sans état. Le jeton Bearer est vérifié par `modules/mcp/authentification` avant `withMcpAuth`, qui ne fait que transmettre l'identité du jeton.
- Jetons `carreau_…` : 256 bits, affichés une seule fois, stockés hachés, portée `lecture` ou `ecriture`, révocables, `dernier_usage_le` mis à jour au plus une fois par minute.
- Outils :
  - lecture : `classes_lister` (noms uniquement), `qcm_lister`, `qcm_lire` ;
  - écriture : `qcm_creer` (toujours en brouillon), `question_ajouter`, `question_modifier`, `question_supprimer`, `questions_lier`, `questions_delier`. L'écriture n'est possible que sur un QCM en brouillon.
- Absents volontairement : étudiants, résultats, événements, sessions, images, publication.
- Corps limité à 512 Kio, 60 appels par minute et par jeton, réponses en `no-store`, chaque appel journalisé sans ses arguments. Les outils passent par les mêmes services que l'interface.
- Les instructions du serveur rappellent de n'écrire que sur demande explicite de l'enseignant. Le contenu renvoyé est du texte brut, jamais interprété par Carreau.

## 11. Sécurité

### 11.1 Menaces et parades

| Menace | Parade |
| --- | --- |
| Lire les bonnes réponses ou la question suivante | Le client ne reçoit que la question courante, sans l'indicateur `correcte` ; les images passent par une route qui vérifie que l'image appartient à la question courante de la participation (ou à la correction publiée) |
| Valider hors délai ou revenir en arrière | Échéances et rang vérifiés côté serveur, dans une transaction verrouillée |
| Falsifier le chrono | Seule l'horloge du serveur compte |
| Se faire passer pour un camarade | Nom lié au premier appareil ; toute seconde réclamation passe par l'enseignant, qui voit aussi connectés et absents |
| Rejoindre depuis l'extérieur | Code valable 60 s au plus, uniquement en salle d'attente ; aucune entrée après le démarrage |
| Deviner un code | 32⁶ combinaisons, fenêtre de 60 s, limiteur par IP |
| Masquer ses sorties | Le silence est détecté par le serveur ; une coupure réseau déclarée reste visible pour l'enseignant |
| Saturer l'application | Limiteur par participation et par ticket ; limites par IP larges, car toute la salle partage une IP |
| Accéder aux données d'un autre enseignant | Droits vérifiés dans chaque service ; refus en 404 ; matrice de refus testée |
| Injection SQL | Requêtes paramétrées Drizzle ; aucune concaténation dans `sql` |
| XSS | Aucun HTML injecté : énoncés et propositions en texte, code en jetons React ; CSP à nonce ; images ré-encodées, SVG refusé |
| Fichier malveillant | Type vérifié sur les octets, ré-encodage `sharp`, nom UUID, `nosniff` |
| Vol de session enseignant | Cookie `__Host-`, TOTP obligatoire, inactivité 30 min, révocation à la réinitialisation et à la désactivation |
| Vol de jeton MCP | Portée limitée aux brouillons, révocation, journal d'usage |
| Fuite de la clé Resend | Chiffrée en AES-256-GCM, jamais réaffichée ni journalisée |
| Détournement de l'envoi d'e-mails | Envois réservés aux comptes authentifiés, limite par destinataire |

### 11.2 Limites de débit (valeurs v1)

| Point d'entrée | Clé | Limite |
| --- | --- | --- |
| Connexion | compte / IP (comptes inconnus) | 5 échecs en 15 min, blocage 15 min / 100 échecs en 15 min |
| Code TOTP | compte | 5 échecs en 15 min |
| Rejoindre | IP | 120 par minute |
| Recherche de nom | ticket d'entrée | 30 par minute |
| Réclamer un nom | ticket d'entrée | 10 par minute |
| État, sélection, réponse, événements | participation | 120 par minute chacun |
| Invitations | compte émetteur / destinataire | 20 par heure / 3 par heure |
| MCP | jeton | 60 par minute |

## 12. Gestion d'erreurs

- Les services lèvent `ErreurService` ; les enveloppes (`action`, `reponse-api`, `page`) les convertissent. Aucune pile d'appels ni requête SQL n'est exposée en production.
- Côté étudiant, les requêtes sont rejouées avec un délai croissant ; l'écran indique « Connexion perdue, tes réponses sont enregistrées » et reprend seul. Les validations sont idempotentes.
- Toute erreur Resend, tout refus d'accès et tout déclenchement du limiteur est journalisé (sans donnée personnelle en clair).
- Les états impossibles (session terminée, question déjà validée, demande déjà traitée) renvoient `ETAT` avec un message compréhensible, jamais une erreur 500.

## 13. Tests

| Niveau | Outil | Cible |
| --- | --- | --- |
| Unitaire | Vitest | `moteur` (mélange, notation, échéances, indice, code de session, normalisation) : **couverture ≥ 95 %** ; utilitaires `lib` |
| Intégration | Vitest + PostgreSQL Docker dédié (base modèle clonée par fichier) | Services : **couverture ≥ 85 %** ; matrice des refus d'accès (chaque rôle contre chaque ressource d'autrui) |
| Bout en bout | Playwright sur le build standalone | Projets `Desktop Chrome` (enseignant), `iPhone 15` (WebKit) et `Pixel 7` (Chromium) (étudiants) |

Cas de concurrence testés en intégration, sur une vraie base avec verrous de ligne :

- double validation simultanée de la même question ;
- deux téléphones qui réclament le même nom au même instant ;
- validation qui arrive en même temps que l'échéance ;
- clic sur « Démarrer » pendant qu'un étudiant réclame son nom.

Scénario de bout en bout principal : un enseignant crée une classe et un QCM, lance une session ; trois étudiants rejoignent sur téléphones émulés ; l'un quitte la page (visibilité simulée), un autre perd le réseau ; l'examen se termine par échéance ; l'enseignant vérifie les indices et exporte les résultats.

Horloge injectée à des valeurs réalistes. Aucun fichier `.env.local` chargé avant Vitest. Intégration continue GitHub Actions à chaque push sur `main` : lint, types, tests unitaires, tests d'intégration (service PostgreSQL), build, tests de bout en bout.

Ports locaux : base de développement **50170**, base de test **50171**, serveur de bout en bout **50172**, serveur de développement **50173** (bloc 50170-50179, disjoint d'iut-tc).

## 14. Lots de livraison

Chaque lot fait l'objet d'un plan détaillé (`/flotte-plan`), d'un intégrateur désigné, de tests verts, d'une mise à jour de la documentation (README compris) et de commits structurés.

| Lot | Contenu | Livrable vérifiable |
| --- | --- | --- |
| 0 — Socle | Projet Next.js, TypeScript strict, ESLint (frontières) et Prettier, Tailwind et jetons de design, `env`, Drizzle et Docker Compose de développement, contrats `lib`, horloge, limiteur, journal, `proxy.ts` et en-têtes, route santé, Dockerfile, infrastructure de tests, intégration continue | Build standalone qui démarre, CI verte, page d'accueil aux couleurs de Carreau |
| 1 — Comptes | Script `admin:creer`, activation, connexion et TOTP, sessions, invitations, réinitialisation, gestion des comptes, rôles, paramètres (Resend chiffré, envoi de test, RGPD) | Un super-admin invite un enseignant qui active son compte avec TOTP |
| 2 — Classes | Classes, étudiants, import CSV / XLSX / collage, tiers-temps | Import d'une liste de 30 étudiants avec rejets expliqués |
| 3 — QCM | Éditeur, types, images, code, barème, liaisons, chrono, statuts, aperçu | Un QCM de 20 questions passe en « prêt » |
| 4 — Sessions et entrée | Création et liste des sessions, code tournant et QR, écran projeté, rejoindre, recherche, réclamation, information, salle d'attente, démarrage commun, demandes d'appareil | 30 téléphones émulés rejoignent et démarrent ensemble |
| 5 — Passage de l'examen | Instantané, mélange, service de la question, sélection, validation, échéances, tiers-temps, reprise, fin, notation | Un examen complet se déroule et se note sans intervention |
| 6 — Surveillance et suivi | Capture client, battements, consolidation, indice v1, tableau de bord (ordinateur et téléphone), prolonger, terminer, alertes | Une sortie simulée apparaît dans le tableau de bord avec sa durée |
| 7 — Résultats | Tableau, visibilité note et correction, exports, rapport étudiant, rattrapage | Export XLSX conforme ; rapport avec détail de l'indice |
| 8 — MCP | Gestion des jetons, serveur, outils, tests de sécurité | Un assistant crée un brouillon de QCM par MCP |
| 9 — PWA et identité | Manifeste, service worker, icônes institutionnelles, scanner intégré, captures réelles dans le README | Application installable ; README illustré |
| 10 — Exploitation | Purges RGPD, sauvegarde de la base et du volume d'images, déploiement Coolify derrière Nginx Proxy Manager, tests de fumée en production, documentation de déploiement | Application en ligne, purges et sauvegardes vérifiées |

## 15. Hors périmètre

- Banque de questions et tirage aléatoire ; formules LaTeX.
- Édition des modèles d'e-mails en base.
- WebSocket, SSE, file de messages ; plusieurs instances simultanées.
- MinIO ou stockage objet.
- OAuth pour le serveur MCP ; images, sessions ou résultats par MCP.
- Codes de secours TOTP (remplacés par la réinitialisation par un admin).
- Passage d'examen hors ligne ; notifications push.
- Interface multilingue (français uniquement) ; thème sombre.
- Crédit partiel sur les choix multiples.
