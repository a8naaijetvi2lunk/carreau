# Carreau — mémoire du projet

Architecture, décisions structurantes et règles métier. Ce document décrit l’intention ; il est complété au fil de l’implémentation.

## Vue d’ensemble

Application web unique (Next.js 16) servant trois publics :

| Public | Accès | Appareil principal |
| --- | --- | --- |
| Étudiant | Sans compte : code de session + choix de son nom dans la liste de la classe | Téléphone (navigateur ou PWA) |
| Enseignant | Compte sur invitation | Ordinateur, téléphone pour le suivi en direct |
| Administration | Rôles `super-admin` et `admin` | Ordinateur |

## Modèle métier

- **Classe** : liste d’étudiants (nom, prénom, tiers-temps) appartenant à un enseignant.
- **QCM** : questions ordonnées, barème, mode de chrono (aucun, global, par question), visibilité par défaut de la note et de la correction. Statut : brouillon, prêt, archivé.
- **Question** : choix unique, choix multiples ou vrai/faux ; énoncé, image et bloc de code facultatifs ; réponses (texte et/ou image) ; points (bonne, mauvaise, sans réponse). Peut être liée à la question précédente ou suivante.
- **Session** : un QCM × une classe × un créneau. États : salle d’attente, en cours, terminée. Une session de rattrapage vise un ou plusieurs étudiants précis ; ses résultats rejoignent ceux de la classe.
- **Participation** : un étudiant dans une session, lié à un appareil ; ordre de questions et de réponses propre à l’étudiant ; réponses ; événements.
- **Événement** : fait horodaté côté serveur (sortie de l’application, perte de focus, copier-coller, reconnexion, second appareil, etc.).

## Règles structurantes

1. **Le serveur fait foi.** Chrono, ordre, bonnes réponses, score et indice sont calculés côté serveur. Le client ne reçoit que la question en cours, sans ses bonnes réponses.
2. **Mélange par étudiant.** Les questions sont mélangées par blocs : une chaîne de questions liées forme un bloc qui garde son ordre interne. Les réponses sont toujours mélangées.
3. **Pas d’entrée tardive.** Après le démarrage, personne ne rejoint la session ; l’enseignant ouvre un rattrapage.
4. **Un appareil par étudiant.** Une tentative sur un second appareil déclenche une alerte que l’enseignant autorise ou refuse. Même logique pour une reprise après coupure sur un autre appareil.
5. **Code de session tournant.** Le code affiché (et le QR code) change toutes les 30 secondes pendant la salle d’attente.
6. **Indice de suspicion.** Somme pondérée d’événements bruts, bornée à 100, recalculable si la pondération évolue. Les coupures réseau ne comptent pas. L’indice n’est affiché qu’aux enseignants ; l’interface étudiante n’emploie ni « surveillance » ni « suspicion ».
7. **MCP limité.** Un jeton par enseignant, révocable. Outils : créer et modifier des brouillons, lister les QCM et le nom des classes. Aucun accès aux étudiants, aux résultats ni au lancement de session.
8. **Rôles.** `super-admin` : tout, dont les rôles et les paramètres (Resend, invitations, conservation). `admin` : inviter, relancer, désactiver des enseignants. `enseignant` : ses classes, QCM, sessions et résultats.
9. **Conservation.** Durées des événements et des résultats laissées vides à l’initialisation, renseignées par le super-admin ; suppression automatique à l’échéance.

## Architecture technique

Décrite dans [`docs/specs/2026-09-28-carreau-architecture-design.md`](specs/2026-09-28-carreau-architecture-design.md) : arborescence, modèle de données, moteur d'examen, surveillance, sécurité, tests et lots de livraison.

## Comptes (lot 1)

- **Connexion en deux temps** : le mot de passe (ou l'activation) ouvre une session en attente (`double_auth_validee = false`), valable 10 min. Le code TOTP la valide : le jeton change (rotation), la session devient complète pour 12 h (30 min d'inactivité) ou, avec « Rester connecté », 30 jours sans limite d'inactivité.
- **Enrôlement du TOTP** : porté par la session en attente. Le secret à enrôler est tiré à l'affichage de l'écran de double authentification et stocké chiffré sur la session (`session_connexion.totp_en_attente_chiffre`) ; il ne rejoint le compte (`utilisateur.totp_secret_chiffre`) qu'à la validation du premier code.
- **Cookie de session** : nom et attribut `Secure` déduits du protocole de `APP_URL`, jamais de `NODE_ENV` — `__Host-carreau_session` + `Secure` en HTTPS, `carreau_session` sans `Secure` sinon.
- **Invitation** : ne porte que l'email et le rôle ; nom et prénom sont saisis à l'activation. Le lien d'activation, à usage unique, est affiché une fois à l'inviteur (résultat de l'invitation ou de la relance), que l'email soit parti ou non. Une seule invitation en attente par adresse.
- **Premier compte** : créé hors interface par `npm run admin:creer -- <email>` (script serveur). Au moins un super-admin actif en permanence : toute action de gestion par un super-admin verrouille d'abord la liste des super-admins actifs et vérifie qu'il en fait toujours partie.
- **TOTP écrit dans le projet** (amendement A1 au plan du lot 1) : `@oslojs/otp` signalé « no longer supported » par npm le 29/07/2026 ; HOTP (RFC 4226) et TOTP (RFC 6238) réécrits avec `node:crypto`, base32 (RFC 4648) inclus, testés contre les vecteurs officiels des trois RFC.

### Modules du lot

- `auth` : hachage argon2id, sessions (ouverture en attente, validation, révocation), TOTP (génération, vérification, anti-rejeu par pas), acteur de la session courante.
- `comptes` : activation, invitations (créer, relancer, annuler), gestion des comptes (lister, désactiver, réactiver, réinitialiser la double authentification, changer le rôle), mot de passe oublié.
- `parametres` : ligne unique de configuration (envoi Resend chiffré, validité des invitations, conservation RGPD) ; ne renvoie jamais la clé Resend à une page.
- `emails` : modèles écrits dans le code (invitation, relance, réinitialisation, test), transport Resend injectable, limite par destinataire.

### Décisions prises pendant le run (en plus de D1 à D13 du plan)

1. TOTP écrit dans le projet plutôt que `@oslojs/otp` (amendement A1).
2. `journaliserLesRefus` (module `journal`) : chaque service à acteur journalise `acces.refus` hors transaction quand il lève `ACCES_REFUSE` (spec §12).
3. Mot de passe oublié : la demande ne fait que valider et compter la limite par IP ; recherche du compte, écriture du jeton et envoi s'exécutent après la réponse (`after()` de Next), pour une durée de réponse identique que le compte existe ou non.
4. Réinviter une adresse ne remplace l'invitation en attente que si l'acteur gère le rôle de cette invitation (sinon `ACCES_REFUSE`) ; le journal garde l'identifiant de l'invitation remplacée.
5. `admin:creer` valide l'adresse avec la même règle que la connexion (regex de `z.email()`).
6. Les tests de `src/modules` sont en `*.integration.test.ts` : seule la suite d'intégration mesure la couverture des modules.

## Classes (lot 2)

- **Propriété** : chaque compte a ses classes, invisibles pour tous les autres (super-admin compris). La ressource d'un autre compte répond « introuvable » (`erreurs.ressourceAutrui`, marqueur `refusAcces`) et fait journaliser `acces.refus` par `journaliserLesRefus`.
- **Archivage au lieu de suppression** : 200 classes par compte, 500 étudiants par classe. Les homonymes parfaits (mêmes nom et prénom normalisés) sont refusés par les noms normalisés (`src/lib/noms.ts`, dans `lib` et non `moteur` : la page filtre la liste côté client avec la même fonction).
- **Import en trois étages** : lecture (le type du fichier est décidé sur ses octets, jamais l'extension ; CSV en UTF-8 ou Windows-1252 ; séparateur lu sur la ligne des titres) → analyse (une archive XLSX est contrôlée avant décompression : 10 Mio décompressés au plus, 100 entrées au plus) → aperçu, puis import confirmé à partir des lignes de l'aperçu, entièrement revalidées (jamais le fichier lui-même). Toute écriture sur une classe ou ses étudiants passe par un verrou `SELECT … FOR UPDATE` sur la ligne `classe`.
- **Module `classes`** : `classes.ts`, `etudiants.ts`, `import/` (`lecture`, `archive`, `analyse`, `import`, `messages`).
- **À retenir pour le lot 7** : un nom importé peut commencer par `=`, `+`, `-` ou `@` ; les exports CSV et XLSX devront neutraliser ces cellules (décision D17).
- **À retenir pour le lot 4** : la table `participation` référencera `etudiant` en `ON DELETE RESTRICT` et `retirerEtudiant` devra alors refuser (`ETAT`) un étudiant qui a déjà participé ; la création de session ne proposera que les classes non archivées.
- **Normalisation et données stockées** : `nom_normalise` et `prenom_normalise` sont calculés une fois, à l'écriture. Toute évolution future de `normaliserNom` doit s'accompagner d'une migration qui recalcule ces colonnes, sinon la détection des homonymes compare deux normalisations différentes.

### Décisions prises pendant le run (en plus de A1 et D1 à D18 du plan)

1. Normalisation : caractères invisibles (catégorie Unicode Cf) retirés, ‘ et ´ traités comme apostrophes ; clé d'homonymie `JSON.stringify([nom, prénom])` normalisés (`cleNormalisee`), identique dans les services, l'analyse et l'import.
2. `creerClasse` verrouille la ligne du compte (`FOR UPDATE`) avant de compter ses classes : la limite de 200 tient sous concurrence.
3. Aucun `key` sur le panneau d'une classe : Next 16 (sans `cacheComponents`) remonte la page quand le paramètre de route change, vérifié à l'exécution (aucun brouillon, aperçu ni recherche ne passe d'une classe à l'autre).
4. Pas de filet `estViolationUnicite` sur les étudiants : chaque écriture verrouille la classe avant de contrôler les homonymes, la course est inatteignable.

## QCM (lot 3)

- **Propriété** : chaque compte a ses QCM et ses images, invisibles pour tous les autres. La ressource d'un autre compte répond « introuvable » (`erreurs.ressourceAutrui`) et fait journaliser `acces.refus` par `journaliserLesRefus`.
- **Brouillon et « prêt »** : un brouillon peut être incomplet ; les règles de complétude (`src/lib/regles-qcm.ts`, dans `lib` et non `moteur` : l'éditeur les affiche en direct) décident du passage en « prêt ». Seul un brouillon se modifie ; « prêt » et « archivé » sont en lecture seule ; aucune suppression de QCM.
- **Questions liées** : `liee_a_suivante` sur la question du dessus, la dernière jamais liée ; « Monter » et « Descendre » déplacent le bloc entier ; positions réécrites en deux temps (négatives puis finales) sous verrou du QCM.
- **Enregistrement automatique** : question entière envoyée 800 ms après la dernière frappe, réponses remplacées en bloc (identifiants non stables) ; `src/lib/enregistreur.ts` (vidange avant toute navigation ou action de l'éditeur).
- **Images** : signature des octets puis format confirmé par `sharp`, WebP de 1 600 px au plus sans métadonnées, fichier `IMAGES_DIR/<uuid>.webp`, lecture par `GET /api/images/[imageId]` (propriétaire seulement), `images.unoptimized: true`.
- **Code** : `shiki` côté serveur (moteur JavaScript), jetons `{ texte, couleur }` rendus comme du texte.
- **Modules** `qcm` (`commun`, `qcm`, `questions`, `code`, `apercu`) et `images` (`signature`, `traitement`, `stockage`, `images`).
- **À retenir pour les lots 4 et 5** : une session ne se crée que sur un QCM prêt, et le démarrage doit revérifier qu'il l'est encore (l'enseignant peut le repasser en brouillon pendant la salle d'attente). L'instantané copie le contenu (les identifiants des réponses ne sont pas stables). `decouperEnBlocs` sert au mélange. `QuestionEtudiant` et `VueQuestion` servent à l'écran d'examen. La route des images devra accepter une participation dont la question courante (ou la correction publiée) cite l'image.
- **À retenir pour le lot 8** : le MCP passe par les mêmes services (`creerQcm` avec `origine: "mcp"` à ajouter, `ajouterQuestion`, `enregistrerQuestion`, `supprimerQuestion`, `lierQuestion`), sur des brouillons seulement.
- **À retenir pour le lot 10** : purger les images orphelines, citées ni par une question, ni par une réponse, ni par un instantané de session.

### Décisions prises pendant le run (en plus de A1 et D1 à D19 du plan)

1. `EnregistreurDiffere` : seule la dernière valeur prise en charge revient en attente après un échec (une ancienne valeur pouvait sinon écraser la plus récente).
2. `next.config.ts` trace explicitement les dépendances d'exécution de shiki (`PAQUETS_SHIKI`), à relever à chaque montée de version de shiki.
3. `e2e/serveur.mjs` démarre une copie du build autonome placée hors du dépôt : Node ne remonte plus au `node_modules` du projet, un paquet absent du build fait échouer les tests de bout en bout comme il ferait échouer l'image Docker.
4. Onglet Paramètres : une durée masquée (mode de chrono non choisi) s'affiche quand elle porte une erreur.
5. Aperçu : une réponse illustrée s'affiche en colonne même si les autres n'ont pas d'image.

## Sessions et entrée des étudiants (lot 4)

- **Session** : un QCM prêt et une classe non archivée du même compte, un créneau facultatif (heure de Paris), la visibilité de la note et de la correction. 50 sessions ouvertes au plus par compte. États : salle d'attente, en cours, terminée (lots 5 et 6), annulée. Une session créée ne se modifie pas : on l'annule, ce qui supprime ses participations.
- **Code tournant** : `src/moteur/code-session.ts`, HMAC-SHA256 du secret de la session et de la fenêtre de 30 s, 6 caractères de Crockford ; code courant et précédent acceptés. Amendement A1 : pendant l'examen, le code ne sert qu'à demander une reprise sur un autre téléphone ; il n'est plus projeté, l'enseignant le montre depuis sa page de pilotage.
- **Téléphone** : ticket d'entrée signé (HKDF de `CHIFFREMENT_CLE`, 10 min) puis jeton d'appareil de 256 bits (cookie de 30 jours, empreinte seule en base). Cookies lus dans l'en-tête `Cookie` et posés par `Set-Cookie` sur la réponse des routes d'API : jamais `next/headers` côté étudiant, routes testables en les appelant.
- **Réclamation** : verrous session (`FOR SHARE`), étudiant (`FOR KEY SHARE`), participation (`FOR UPDATE`) ; la course de deux téléphones se règle par `ON CONFLICT DO NOTHING`, le perdant passe par une demande d'appareil. « Démarrer » verrouille la session en `FOR UPDATE` : une réclamation en cours aboutit d'abord, sinon elle reçoit « La session a démarré ».
- **Demandes d'appareil** : une seule en attente par participation, 10 min au plus ; « Autoriser » donne la participation au nouveau téléphone et garde l'empreinte de l'ancien (`ancien_jeton_hash`) pour lui dire qu'il a été remplacé. Chaque demande écrit un événement `second_appareil` (indice du lot 6).
- **Temps réel** : `src/lib/interrogation.ts` (un appel à la fois, période par résultat, délai croissant après un échec, suspension de l'onglet enseignant masqué). Téléphone toutes les 2 à 5 s selon l'étape (`periodeEntreeMs`), pilotage 3 s, écran projeté 2 s. Le compte à rebours (`useRebours`) est calé sur `serveurMaintenant`.
- **Modules** : `sessions` (`commun`, `code`, `ticket`, `cookies`, `cles`, `sessions`, `suivi`, `entree`, `pilotage`) ; `parametres.lireInformationDonnees` pour l'écran d'information ; `classes.retirerEtudiant` refuse un étudiant qui a participé.
- **Lot 5** : voir « Passage de l’examen (lot 5) » ci-dessous.
- **À retenir pour le lot 6** : le suivi (`construireSuivi`, route `suivi`) s'enrichit de la progression, des indices et des alertes ; `evenement` existe déjà (type `second_appareil`) ; `participation.dernier_contact_le` est mis à jour à chaque état.
- **À retenir pour le lot 7** : `type`, `session_origine_id` et `session_autorisation` (rattrapage) restent à créer ; la visibilité de la note et de la correction se règle de nouveau avec les résultats.
- **À retenir pour le lot 10** : purger les participations et leurs événements selon la conservation, et les sessions annulées.

## Passage de l’examen (lot 5)

- **Instantané** : au démarrage, `qcm.instantaneDuQcm` fige le QCM dans `session_examen.contenu` (bonnes réponses, barème, durées effectives, code déjà coloré), validé par `schemaContenuSession` ; la fin prévue est écrite avec. Les résultats (lot 7) liront l'instantané, jamais le QCM.
- **Passage de chacun** : ordre (`participation.ordre` : `{ q, p }`, blocs de questions liées mélangés, réponses mélangées, `randomInt`), tiers-temps figé au départ (amendement A1), première question servie au départ, échéances.
- **Règle unique d'expiration (A3)** : une échéance devient effective 3 s après sa valeur, partout ; la question suivante est servie à l'instant d'expiration ; une question échue est validée avec son brouillon (`echeance`), les questions jamais servies à la fin restent sans réponse (`fin`).
- **Moteur** : `melange`, `echeances` (`appliquer`, `apresValidation`, `terminer`), `notation` (tout ou rien, centièmes entiers, total borné à 0, note sur 20).
- **Module `examen`** (appelé par `sessions`, ne l'importe jamais) : `depart`, `passage` (verrous session puis participation, rattrapage, note, clôture de session journalisée par le système), `reponses` (brouillon, validation idempotente), `vue` (question courante extraite en SQL, positions affichées, écran de fin), images de la question courante.
- **Téléphone** : étapes « question » et « fin » sur `/rejoindre` (A2) ; brouillon à chaque touche, en file ; interrogation toutes les 5 s ou juste après l'expiration ; `<main data-commence-a>` pour mesurer le départ commun.
- **Enseignant** : le suivi rattrape les échéances et tente la clôture à chaque interrogation ; avancement de chacun ; résumé lu dans l'instantané après le départ.
- **À retenir pour le lot 6** : `evenement` et `dernier_contact_le` existent ; « Terminer pour tous » s'appuiera sur `moteur/echeances.terminer` et sur la clôture de `passage.ts` ; sans chrono, seule la fin de tous les passages clôt une session.
- **À retenir pour le lot 7** : correction et rapport lisent `contenu`, `ordre` et `reponse.selection` (index d'origine) ; les images de la correction publiée devront s'ajouter à la règle de lecture des images (D12).

## Surveillance et suivi en direct (lot 6)

- **Signaux** : le téléphone (capture `src/lib/capture-examen.ts`, amendement A1) envoie la nature de ce qu'il observe (`debut`, `masquee`, `visible`, `focus_perdu`, `focus_revenu`, `copie`, `coupe`, `colle`, `ecran_partage`, `hors_ligne`, `en_ligne`), numérotée, par `fetch` `keepalive` (A2) ; le serveur horodate à la réception, dédoublonne par (participation, chargement, numéro) et garde 1 000 événements au plus par passage.
- **Contact et silence** : toute requête du téléphone pendant l'examen (état, sélection, réponse, événements) est un contact, noté dans la transaction verrouillée du passage ; un écart de plus de 15 s donne un événement `silence` mesuré par le serveur. À la fin d'un passage muet, un silence jusqu'à la fin est inséré.
- **Moteur** (`src/moteur/indice.ts`) : consolidation (sorties de page, silences expliqués par un `masquee` ou un `hors_ligne` reçu dans les 10 s, sinon sortie inexpliquée ; coupures ; pertes de focus hors sortie ; ponctuels ; rechargements = chargements distincts − 1) puis indice v1 (sortie 5 à 45 points, focus ≥ 2 s 6, presse-papiers 10, réponse rapide 12, second appareil 20, écran partagé 5, coupure et rechargement 0, total borné à 100). Règle D4-bis (consolidation) : une sortie de page, une coupure ou une perte de focus restée ouverte se referme au premier retour constaté par le serveur — son événement de fermeture, un événement venu d'un autre chargement de la page (rechargement), ou, pour une sortie ou une coupure, la fin d'un silence commencé après elle (le téléphone a recontacté le serveur) — sinon à la fin du passage ; un silence qui chevauche une sortie ou une coupure retenue est ignoré (déjà compté) ; une sortie ou une coupure qui commence à la fin d'un silence ou après ne l'explique pas (nouvelle absence), l'événement d'ouverture étant identifié lui-même et non par son heure (les événements d'un même lot partagent l'heure de réception) ; la réponse rapide est comptée dès l'instant du retour (`[fin, fin + 10 s]`).
- **Indice** : calculé à chaque interrogation du tableau de bord (avec un silence en cours provisoire), écrit en base (`indice`, `indice_version`, `indice_detail`) seulement à la fin d'un passage.
- **Enseignant** : `TableauDeBord` pendant et après l'examen (statut, progression, indice, dernier événement, compteurs, filtres, alertes, demandes d'appareil, code de reprise) ; « Prolonger » (chrono global, `prolongerPassages`) et « Terminer pour tous » (`cloturerSiFinie` forcée).
- **Téléphone** : bandeau neutre au retour d'une sortie d'au moins 2 s, pendant 30 s.
- **Reprise autorisée** (amendement A3 du lot 7) : `autoriserDemande` insère un événement serveur `appareil_autorise` sur la participation ; la consolidation apparie chaque autorisation à la dernière demande `second_appareil` non appariée qui la précède (0 point au lieu de 20) et transforme en « changement de téléphone » (0 point, retiré des sorties) l'absence qui contient l'heure de cette demande. La pondération reste la version 1, amendée avant toute session réelle.
- **À retenir pour le lot 7** : le rapport par étudiant lit `indice_detail` et la chronologie (`evenement`, faits de `faitsNotables`) ; l'indice se recalcule avec `consolider` et `calculerIndice` si la pondération change (version stockée).

## Résultats (lot 7)

- **Rattrapage** : `session_examen.type` (`classe`, `rattrapage`) et `session_origine_id` ; `session_autorisation` liste les étudiants autorisés. Un rattrapage se crée depuis les résultats d'une session terminée, pour des absents (`situationsExamen` : passé, rattrapage prévu, absent) ; il copie l'instantané et la visibilité de son origine. Seuls les autorisés le trouvent et le réclament ; son démarrage ne contrôle plus le QCM.
- **Racine et famille** : la racine est la session d'origine ; sa famille, la racine et ses rattrapages. Les résultats, la visibilité (réglée sur toute la famille) et l'adresse des pages passent toujours par la racine.
- **Module `resultats`** (sens d'import `resultats → sessions → examen`) : liste des examens terminés, tableau (une ligne par étudiant actuel de la classe), statistiques, visibilité, rapport, exports. Les passages échus des rattrapages en cours sont rattrapés à chaque lecture (spec §6.5).
- **Exports** : CSV pour Excel en français (`src/lib/csv.ts` : BOM, « ; », CRLF, texte qui commencerait une formule préfixé d'une apostrophe, jamais un nombre) ; XLSX par `write-excel-file` (hors bundle comme `read-excel-file`), « Synthèse » puis une feuille par question, texte typé `String`.
- **Rapport** : lignes stockées de l'indice (avec la durée totale recalculée), chronologie (`src/moteur/chronologie.ts`), évolution de la même fiche chez le même enseignant. Questions numérotées dans l'ordre du QCM (le tableau de bord garde le rang de l'étudiant).
- **Correction** (amendement A1) : servie au téléphone de l'étudiant (`POST /api/etudiant/correction`) une fois la session terminée avec la correction visible et aucune session de la famille ouverte ; l'écran de fin est relu toutes les 15 s ; ses images passent par la route contrôlée.
- **À retenir pour le lot 10** : purger les autorisations avec leurs sessions ; les résultats suivent la conservation des résultats.

## Ports locaux

| Usage | Port |
| --- | --- |
| PostgreSQL de développement | 50170 |
| PostgreSQL de test | 50171 |
| Serveur des tests de bout en bout | 50172 |
| Serveur de développement (`next dev`) | 50173 |
| Conteneur de vérification locale de l'image Docker | 50174 |

Bloc réservé : 50170-50179 (hors des plages réservées par Hyper-V).

## Maquettes

Dix-sept écrans de référence (parcours étudiant, enseignant, administration) ont été produits avant le cadrage. Le README montre l’application réelle : `npm run captures` (script Playwright dédié, `e2e/captures/`, jamais lancé par `npm run test:e2e`) régénère les captures de `docs/captures/` à chaque lot, sur le build de production et avec des données fictives.
