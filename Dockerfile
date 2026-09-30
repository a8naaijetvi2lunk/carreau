# --- Étape 1 : dépendances ---------------------------------------------------
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# --- Étape 2 : build ----------------------------------------------------------
FROM node:24-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# Clé des Server Actions : fournie au build, identique d'un déploiement à l'autre,
# sinon un redéploiement en plein examen casserait les formulaires ouverts.
ARG NEXT_SERVER_ACTIONS_ENCRYPTION_KEY
ENV NEXT_SERVER_ACTIONS_ENCRYPTION_KEY=$NEXT_SERVER_ACTIONS_ENCRYPTION_KEY
# Aucune autre variable : la validation de l'environnement est paresseuse.
RUN npm run build

# --- Étape 3 : image d'exécution ----------------------------------------------
FROM node:24-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

# Volumes (décision D8 du plan du lot 10) : images téléversées et archives de leur sauvegarde. Posées
# ici pour qu'un oubli dans Coolify ne bloque pas le démarrage.
ENV IMAGES_DIR=/data/images
ENV SAUVEGARDES_DIR=/data/sauvegardes

# Volumes possédés par l'utilisateur non root de l'image (node) : un volume nommé neuf en hérite.
RUN mkdir -p /data/images /data/sauvegardes && chown node:node /data/images /data/sauvegardes

COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/drizzle ./drizzle
COPY --from=build --chown=node:node /app/scripts ./scripts
COPY --chown=node:node docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

USER node

EXPOSE 3000

# 127.0.0.1 et non localhost : sur l'image alpine, localhost se résout d'abord en IPv6. ${PORT} : le
# healthcheck suit le port d'écoute s'il change.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget --spider -q "http://127.0.0.1:${PORT}/api/sante" || exit 1

ENTRYPOINT ["./docker-entrypoint.sh"]
