# ─────────────────────────────────────────────────────────────────
# Imatge de producció d'El Cançoner.
#
# Base Debian (no Alpine): better-sqlite3 es compila nativament i
# Chromium hi és un .deb normal — a Ubuntu és un snap, que no
# funciona dins d'un contenidor.
#
# Tres etapes per no arrossegar les eines de compilació a la imatge
# final: deps (npm ci amb toolchain) → builder (next build) → runner.
# ─────────────────────────────────────────────────────────────────

# ─── Etapa 1: dependències ───────────────────────────────────────
FROM node:22-bookworm-slim AS deps
WORKDIR /app

# better-sqlite3 necessita python3 + g++ + make per compilar el binding natiu.
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 \
      make \
      g++ \
      ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Puppeteer no s'ha de baixar el seu Chromium: la imatge final usa el
# del sistema. Estalvia ~400 MB i una descàrrega durant el build.
ENV PUPPETEER_SKIP_DOWNLOAD=true

COPY package.json package-lock.json ./
RUN npm ci

# ─── Etapa 2: build ──────────────────────────────────────────────
FROM node:22-bookworm-slim AS builder
WORKDIR /app

ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# `next build` arrenca codi de servidor (generateStaticParams, sitemap…)
# que toca la BD. Amb DB_PATH cap a un directori temporal, les migracions
# creen una BD buida d'usar i llençar dins la capa de build; la de debò
# viu al volum i s'hi connecta en arrencar.
ENV DB_PATH=/tmp/build/canconer.db
ENV ANALYTICS_DB_PATH=/tmp/build/analytics.db

RUN npm run build

# ─── Etapa 3: runtime ────────────────────────────────────────────
FROM node:22-bookworm-slim AS runner
WORKDIR /app

# Chromium + les fonts i llibreries que necessita per renderitzar els PDF.
# fonts-liberation i fonts-dejavu cobreixen les piles de fonts de
# song-styles.css; sense elles el PDF surt amb caixes buides.
RUN apt-get update && apt-get install -y --no-install-recommends \
      chromium \
      fonts-liberation \
      fonts-dejavu-core \
      fonts-noto-color-emoji \
      ca-certificates \
      tini \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Puppeteer llegeix aquesta variable a `launch()` — per això no cal
# tocar src/lib/pdf/generate.ts ni src/lib/importers/puppeteerFetch.ts.
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Camins dins del volum persistent muntat a /app/data.
ENV DB_PATH=/app/data/canconer.db
ENV ANALYTICS_DB_PATH=/app/data/analytics.db
ENV ANALYTICS_GEOIP_DB_PATH=/app/data/GeoLite2-Country.mmdb

COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/next.config.mjs ./next.config.mjs

# Les migracions s'apliquen en arrencada (src/db/client.ts i
# analyticsClient.ts criden `migrate()`), així que els .sql han de ser
# a la imatge.
COPY --from=builder /app/data/migrations ./data/migrations
COPY --from=builder /app/data/analytics-migrations ./data/analytics-migrations

# L'usuari `node` ja existeix a la imatge base. El volum de dades s'ha
# de poder escriure: el chown s'aplica al punt de muntatge des del host
# (vegeu el README de desplegament).
RUN mkdir -p /app/data && chown -R node:node /app
USER node

EXPOSE 3000

# tini com a PID 1: Chromium deixa processos zombis si ningú els recull.
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["npm", "run", "start"]
