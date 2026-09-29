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

Dix-sept écrans de référence (parcours étudiant, enseignant, administration) ont été produits avant le cadrage. Les captures seront intégrées au README à partir de l’application réelle.
