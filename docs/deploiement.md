# Déploiement

Carreau tourne en image Docker autonome sur **Coolify**, derrière **Nginx Proxy Manager** (NPM), seul point d'entrée public, qui termine le TLS. Cette page décrit l'installation, les tâches planifiées, les sauvegardes et leur restauration, les tests de fumée et les mises à jour.

```
Internet ──https──▶ Nginx Proxy Manager ──http──▶ hôte Coolify : port publié (ex. 3080)
                                                     └─▶ conteneur Carreau :3000 ──▶ PostgreSQL 17 (réseau interne)
                                                           ├─ volume des images       /data/images
                                                           └─ volume des sauvegardes  /data/sauvegardes
```

## 1. Base de données

1. Dans le projet Coolify, ajouter une ressource **PostgreSQL 17**, sans port publié. Son URL interne sert de `DATABASE_URL`.
2. Onglet **Backups** : sauvegarde planifiée `0 3 * * *` (fréquences Coolify en **UTC**), 14 sauvegardes conservées.

## 2. Application

| Réglage | Valeur |
| --- | --- |
| Source | dépôt GitHub, branche `main` |
| Build pack | Dockerfile |
| Ports | publier `<port hôte>:3000` (ex. `3080:3000`) |
| Domaine Coolify | `http://127.0.0.1:<port hôte>` : c'est NPM qui sert le site |
| Volumes | `carreau-images` sur `/data/images`, `carreau-sauvegardes` sur `/data/sauvegardes` |
| Healthcheck | celui du Dockerfile (`/api/sante` sur `127.0.0.1`) |
| Commandes avant et après déploiement | **vides** : les migrations s'appliquent au démarrage du conteneur ; un `next build` après déploiement tournerait sous le serveur en service |

Variables d'environnement :

| Variable | Contenu |
| --- | --- |
| `DATABASE_URL` | URL interne de la base PostgreSQL |
| `APP_URL` | URL publique, en `https://` (liens d'invitation, QR codes, MCP) |
| `CHIFFREMENT_CLE` | 32 octets en base64, propres à la production : `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` |
| `CRON_SECRET` | secret des purges, 32 caractères au moins : `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` | 32 octets en base64, cochée **Build Variable** (argument du build Docker), jamais changée ensuite : un redéploiement en plein examen ne casse aucun formulaire ouvert |

`IMAGES_DIR`, `SAUVEGARDES_DIR`, `PORT`, `HOSTNAME` et `NODE_ENV` sont déjà posées par l'image.

Les secrets sont générés sur le poste de l'administrateur et collés dans la vue normale des variables. La « Developer view » de Coolify affiche toutes les valeurs en clair : ne jamais l'ouvrir, ni la capturer.

## 3. Nginx Proxy Manager

Enregistrement DNS `A` du domaine vers l'adresse publique, puis un **Proxy Host** :

| Onglet | Réglage |
| --- | --- |
| Details | schéma `http`, adresse de l'hôte Coolify, port publié ; **Cache Assets désactivé** (sinon `sw.js` et le manifeste seraient servis depuis un cache après une mise en ligne) ; Block Common Exploits activé ; Websockets inutile (le suivi en direct interroge le serveur) |
| SSL | certificat Let's Encrypt, Force SSL, HTTP/2 ; **HSTS désactivé** : l'application l'envoie déjà, un second en-tête serait invalide |
| Advanced | `proxy_buffer_size 16k; proxy_buffers 4 16k; proxy_busy_buffers_size 32k;` : marge contre un 502 sur des en-têtes volumineux |

Rien d'autre :
- NPM transmet déjà `X-Real-IP`, la seule adresse que Carreau croit ;
- le serveur MCP envoie lui-même `X-Accel-Buffering: no`, ce qui évite le tampon de nginx sans bloc `location` ;
- nginx retire cet en-tête de la réponse : il ne se voit qu'en accès direct au conteneur.

## 4. Premier compte

Dans le terminal Coolify du conteneur :

```sh
node scripts/admin-creer.mjs prenom.nom@exemple.fr
```

Le lien d'activation s'affiche une seule fois. Il mène au choix du mot de passe, puis à la double authentification.

Le super-admin renseigne ensuite, dans **Paramètres** :
- la conservation des données : sans elle, aucune session ne peut démarrer ;
- l'envoi des emails (Resend).

## 5. Tâches planifiées

Coolify → application → **Scheduled Tasks**. Les fréquences sont en **UTC**. Le champ du conteneur reste vide et le délai à 300 s.

| Nom | Commande | Fréquence |
| --- | --- | --- |
| `purges` | `node scripts/purger.mjs` | `30 2 * * *` |
| `sauvegarde-images` | `node scripts/sauvegarder-images.mjs` | `45 2 * * *` |

« Execute Now » vérifie chacune :
- `purges` écrit `[purger] 200 en … ms : {…"erreurs":[]}` ;
- `sauvegarde-images` écrit `[sauvegarder-images] images-AAAA-MM-JJ.tar.gz : … octets`.

Les deux scripts sortent en erreur si une étape échoue.

Chaque nuit, les purges suppriment :
- les **événements** des sessions finies depuis la durée de conservation des événements ;
- les **sessions** (avec leurs rattrapages, participations, réponses et événements) finies depuis la durée de conservation des résultats. Une session restée en salle d'attente compte depuis sa création ; une session en cours n'est jamais touchée ;
- les images qu'aucune question ni aucun instantané ne cite depuis 24 h ;
- les sessions de connexion expirées ;
- les liens de réinitialisation utilisés ou expirés ;
- les invitations closes depuis 30 jours ;
- le limiteur ;
- le journal de plus de 12 mois.

Leur bilan est écrit au journal (`purges.executer`).

**Si le formulaire de Coolify n'enregistre pas la tâche**, prévoir un cron de l'hôte qui lance le même script dans le conteneur. Le conteneur est retrouvé par le début stable de son nom, l'identifiant de l'application :

```sh
#!/bin/sh
C=$(docker ps -q -f name=<identifiant-application> | head -1)
[ -z "$C" ] && { echo "$(date -Is) conteneur introuvable"; exit 1; }
docker exec "$C" node scripts/purger.mjs
```

## 6. Sauvegardes et restauration

| Quoi | Comment | Où | Durée |
| --- | --- | --- | --- |
| Base | sauvegarde planifiée de Coolify (`pg_dump` au format custom), 3 h UTC | dossier des sauvegardes de Coolify, sur l'hôte | 14 sauvegardes |
| Images | `scripts/sauvegarder-images.mjs`, archive `images-AAAA-MM-JJ.tar.gz`, 2 h 45 UTC | volume `carreau-sauvegardes` | 14 archives |

Limites :
- les deux sauvegardes restent sur l'hôte : une copie hors site est à prévoir à part ;
- une donnée purgée de la base reste jusqu'à 14 jours dans les sauvegardes.

**Restaurer la base**, d'abord dans une base temporaire, pour vérifier :

```sh
docker cp <sauvegarde>.dmp <conteneur-base>:/tmp/carreau.dump
docker exec <conteneur-base> createdb -U <utilisateur> carreau_restauration
docker exec <conteneur-base> pg_restore -U <utilisateur> -d carreau_restauration /tmp/carreau.dump
docker exec <conteneur-base> psql -U <utilisateur> -d carreau_restauration -tAc "select count(*) from utilisateur"
```

En cas de besoin réel, arrêter l'application, restaurer dans la base de production (`pg_restore --clean --if-exists -d <base>`), puis la redémarrer.

**Restaurer les images**, d'abord dans un dossier temporaire :

```sh
docker exec <conteneur-application> sh -c 'mkdir -p /tmp/restauration && tar -xzf /data/sauvegardes/images-AAAA-MM-JJ.tar.gz -C /tmp/restauration && ls /tmp/restauration | head'
```

En cas de besoin réel, extraire dans `/data/images`.

Les deux restaurations sont éprouvées à la mise en service, puis après tout changement de la base ou des volumes.

## 7. Tests de fumée

Depuis un poste avec le dépôt :

```sh
npm run fumee -- https://carreau.yvescharvis.fr
```

Huit contrôles en lecture seule :
- santé ;
- un seul en-tête HSTS ;
- CSP à nonce ;
- en-têtes de l'accueil sous 4 Ko ;
- redirection http → https ;
- type du manifeste ;
- `sw.js` jamais mis en cache ;
- caméra permise sur `/rejoindre` seulement, routes MCP et purges en 401 sans secret.

Code de sortie 1 au moindre échec.

## 8. Mises à jour

1. Pousser sur `main` (CI verte), puis déployer depuis Coolify. Ne pas lancer un déploiement dans les 10 minutes qui précèdent une heure pile : les tâches de fond de Coolify coupent alors la connexion du build (`exit code 255`, à relancer).
2. Les migrations s'appliquent au démarrage ; le healthcheck garde l'ancienne version en service tant que la nouvelle n'est pas saine.
3. Relancer les tests de fumée.
4. Un changement de variable seule s'applique par un redéploiement, sans reconstruction. `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` ne change jamais.
