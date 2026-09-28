#!/bin/sh
set -e

# Migrations versionnées (drizzle/) avant de démarrer le serveur : jamais pendant le build.
node scripts/migrer.mjs
exec node server.js
