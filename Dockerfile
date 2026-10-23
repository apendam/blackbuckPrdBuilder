# PRD Builder (Next.js 16 + Prisma/SQLite). Not built or tested on this machine:
# Docker was not installed when this was written, so run `docker compose build`
# once and fix anything it reports.
FROM node:24-bookworm-slim AS build
WORKDIR /app
# Build tools in case better-sqlite3 has no prebuilt binary for this Node/arch.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
    && rm -rf /var/lib/apt/lists/*
ENV PUPPETEER_CACHE_DIR=/app/.cache/puppeteer
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Generates src/generated/prisma (gitignored), then builds Next.
RUN npx prisma generate && npm run build

FROM node:24-bookworm-slim AS run
WORKDIR /app
# Chrome libraries for Puppeteer (diagram rendering) and git for the Refresh repos button.
RUN apt-get update && apt-get install -y --no-install-recommends \
      git ca-certificates fonts-liberation libnss3 libatk-bridge2.0-0 libatk1.0-0 libcups2 libdrm2 \
      libgbm1 libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libasound2 libpango-1.0-0 \
      libcairo2 libxshmfence1 libx11-6 libxext6 libxcb1 \
    && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production \
    PORT=3000 \
    NEXT_TELEMETRY_DISABLED=1 \
    PUPPETEER_CACHE_DIR=/app/.cache/puppeteer \
    PUPPETEER_NO_SANDBOX=1 \
    DATABASE_URL=file:/app/db/dev.db
COPY --from=build --chown=node:node /app /app
RUN mkdir -p /app/db /app/data && chown -R node:node /app/db /app/data
USER node
EXPOSE 3000
# Creates/updates the SQLite schema, then starts Next on 0.0.0.0.
CMD ["sh", "-c", "npx prisma db push && exec npm run start -- -H 0.0.0.0 -p ${PORT}"]
