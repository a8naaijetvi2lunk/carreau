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

## Ports locaux

| Usage | Port |
| --- | --- |
| PostgreSQL de développement | 50170 |
| PostgreSQL de test | 50171 |
| Serveur des tests de bout en bout | 50172 |

Bloc réservé : 50170-50179 (hors des plages réservées par Hyper-V).

## Maquettes

Dix-sept écrans de référence (parcours étudiant, enseignant, administration) ont été produits avant le cadrage. Les captures seront intégrées au README à partir de l’application réelle.
