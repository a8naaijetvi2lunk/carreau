<div align="center">

# Carreau

**Des QCM sur téléphone, en classe, pour des examens équitables.**

Les étudiants rejoignent l’examen en scannant un QR code et répondent question par question sur leur téléphone. L’enseignant suit la session en direct.

[Fonctionnement](#fonctionnement) · [Anti-triche](#anti-triche--ce-que-carreau-détecte-et-ce-quil-ne-peut-pas-détecter) · [Données personnelles](#données-personnelles) · [Architecture](#architecture) · [Feuille de route](#feuille-de-route) · [Licence](#licence)

![Statut : en développement](https://img.shields.io/badge/statut-en%20d%C3%A9veloppement-orange)
[![Intégration continue](https://github.com/a8naaijetvi2lunk/carreau/actions/workflows/ci.yml/badge.svg)](https://github.com/a8naaijetvi2lunk/carreau/actions/workflows/ci.yml)
![Licence : MIT](https://img.shields.io/badge/licence-MIT-blue)
![Next.js 16](https://img.shields.io/badge/Next.js-16-black)
![PostgreSQL 17](https://img.shields.io/badge/PostgreSQL-17-336791)

</div>

> [!NOTE]
> Carreau est en cours de développement. Les captures d’écran arriveront avec la première version fonctionnelle.

## Pourquoi Carreau

Faire passer un QCM sur le téléphone des étudiants est pratique : pas de papier, correction immédiate, résultats exportables. Mais sur un téléphone, une autre application ou un autre onglet n’est jamais loin.

Un navigateur ne peut pas verrouiller un téléphone. Carreau ne prétend donc pas empêcher toute triche. Il rend les écarts **visibles**, de façon **transparente** pour les étudiants, et laisse l’enseignant juger avec ce qu’il observe en salle.

Le nom tient en un mot : les petits carrés du QR code, les cases qu’on coche, et l’expression « se tenir à carreau ».

## Fonctionnement

### Pour l’étudiant

1. Il scanne le QR code projeté au tableau, ou saisit le code de la session.
2. Il tape les trois premières lettres de son nom et se choisit dans la liste de sa classe. Son téléphone est alors associé à son nom pour toute la durée de l’examen.
3. Un écran d’information lui explique ce qui est noté pendant l’examen, pourquoi, et combien de temps c’est conservé.
4. Il patiente en salle d’attente : l’examen démarre pour tout le monde en même temps.
5. Il répond question par question, sans retour en arrière, avec un chrono si l’enseignant en a prévu un.

Aucun compte ni installation n’est nécessaire. L’application peut être installée sur l’écran d’accueil (PWA) pour ceux qui le souhaitent.

### Pour l’enseignant

- **Compte sur invitation**, envoyée par email.
- **Éditeur de QCM** : choix unique, choix multiples, vrai/faux, images dans les questions et les réponses, blocs de code, barème configurable (points négatifs compris), chrono au choix (aucun, global ou par question).
- **Questions liées** : deux questions qui doivent se suivre restent consécutives, dans leur ordre, où qu’elles tombent dans le mélange.
- **Classes** : import de la liste depuis un fichier CSV ou Excel, ou saisie manuelle ; tiers-temps par étudiant.
- **Sessions** : un QCM, une classe, un créneau. Le QR code projeté change toutes les 30 secondes pour qu’un lien partagé à l’extérieur de la salle ne serve à rien.
- **Suivi en direct** : étudiants connectés et absents, progression, alertes et indice de suspicion, sur ordinateur comme sur téléphone.
- **Résultats** : exports CSV et Excel, rapport détaillé par étudiant, note et correction visibles ou non par les étudiants.
- **Rattrapage** : un étudiant arrivé après le démarrage ne peut plus rejoindre la session ; l’enseignant lui ouvre une session de rattrapage.
- **Connexion MCP** : l’enseignant peut connecter son assistant IA pour préparer des QCM. Tout arrive en brouillon, à relire avant usage.

### Pour l’administration

- Un super-administrateur et des administrateurs invitent, relancent et désactivent les comptes enseignants.
- Le super-administrateur règle l’envoi des emails, la validité des invitations et la durée de conservation des données.

## Anti-triche : ce que Carreau détecte, et ce qu’il ne peut pas détecter

| Détecté et horodaté | Hors de portée d’un navigateur |
| --- | --- |
| Sortie de l’application ou changement d’onglet, avec sa durée | Un second appareil |
| Perte de focus : notification ouverte, écran partagé | Une capture d’écran sur iPhone |
| Copier-coller | Une réponse soufflée par un voisin |
| Temps passé sur chaque question | |
| Un même nom utilisé sur deux appareils | |

Principes retenus :

- **Un sujet différent pour chacun** : l’ordre des questions et celui des réponses sont mélangés pour chaque étudiant.
- **Le serveur fait foi** : le chrono, l’ordre des questions, les bonnes réponses et le score ne dépendent jamais du téléphone. Les bonnes réponses ne quittent pas le serveur pendant l’examen.
- **Un indice, pas un verdict** : les événements bruts sont enregistrés côté serveur, puis pondérés en un indice de 0 à 100. L’enseignant voit le détail du calcul. Ce n’est pas une preuve.
- **Pas de faux positifs réseau** : une coupure de connexion n’est jamais comptée comme une sortie.
- **Un ton non accusateur** : côté étudiant, l’interface parle de « mode examen » et explique ce qui est noté, sans soupçonner personne.

## Données personnelles

- **Minimisation** : nom, prénom, réponses et événements horodatés. Rien d’autre.
- **Information** : chaque étudiant lit, avant l’examen, ce qui est enregistré et à quoi cela sert.
- **Conservation** : durées réglables par l’établissement, suppression automatique à l’échéance.
- **Assistant IA** : via MCP, il ne voit que les brouillons de QCM et le nom des classes, jamais les étudiants ni les résultats.

## Architecture

```mermaid
flowchart LR
  E["Étudiant<br/>téléphone, navigateur ou PWA"] -- "code de session, réponses, événements" --> A
  P["Enseignant<br/>ordinateur ou téléphone"] -- "QCM, sessions, suivi en direct" --> A
  IA["Assistant IA<br/>client MCP"] -- "brouillons de QCM" --> A
  A["Carreau<br/>Next.js 16"] --> DB[("PostgreSQL 17")]
  A -- "invitations" --> M["Resend"]
```

| Domaine | Choix |
| --- | --- |
| Application | Next.js 16 (App Router), React 19, TypeScript |
| Interface | Tailwind CSS 4, PWA |
| Données | PostgreSQL 17, Drizzle ORM |
| Validation | Zod 4, systématique côté serveur |
| Emails | Resend |
| Assistant IA | Serveur MCP (`mcp-handler`) |
| Tests | Vitest (unitaires et intégration), Playwright (parcours complets, dont téléphone) |
| Déploiement | Docker, Coolify |

Les choix techniques et leurs raisons sont consignés dans [`docs/choix.csv`](docs/choix.csv), l’architecture dans [`docs/memory.md`](docs/memory.md) et l’historique dans [`docs/changelog.md`](docs/changelog.md).

## Démarrer en local

Prérequis : Node.js 24 et Docker.

```bash
npm install
cp .env.example .env    # puis renseigner CHIFFREMENT_CLE et NEXT_SERVER_ACTIONS_ENCRYPTION_KEY
npm run db:up           # PostgreSQL de développement (50170) et de test (50171)
npm run db:migrate
npm run dev             # http://localhost:50173
```

| Commande | Rôle |
| --- | --- |
| `npm run lint`, `npm run typecheck` | Qualité du code, frontières d’architecture et types |
| `npm test` | Tests unitaires et couverture |
| `npm run test:integration` | Tests d’intégration sur une base PostgreSQL isolée |
| `npm run build && npm run test:e2e` | Tests de bout en bout sur le build de production (ordinateur, iPhone, Android) |

## Feuille de route

- [ ] Administration : invitations, rôles, paramètres
- [ ] Classes et étudiants, import CSV / Excel
- [ ] Éditeur de QCM : types de questions, images, code, barème, questions liées
- [ ] Sessions : QR code renouvelé, salle d’attente, démarrage commun
- [ ] Passage de l’examen : mélange, chrono serveur, reprise après coupure, tiers-temps
- [ ] Détection des écarts et indice de suspicion
- [ ] Suivi en direct pour l’enseignant
- [ ] Résultats, exports et rapports par étudiant
- [ ] Connexion MCP
- [ ] PWA installable
- [ ] Déploiement

## Sécurité

Carreau sert à évaluer : une faille peut fausser des notes ou exposer des données d’étudiants. Merci de signaler toute vulnérabilité de façon privée, comme décrit dans [`SECURITY.md`](SECURITY.md).

## Contribuer

Les suggestions et retours sont les bienvenus via les issues. Les commits suivent la convention [Conventional Commits](https://www.conventionalcommits.org/fr/), rédigés en français.

## Licence

Distribué sous licence [MIT](LICENSE) — © 2026 Yves Charvis.

Vous pouvez utiliser, modifier et redistribuer Carreau librement, à condition de conserver la mention de l’auteur et le texte de la licence.
