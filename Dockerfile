# ============================================
# Stage 1: Dependencies Installation Stage
# ============================================

ARG NODE_VERSION=24.13.0-slim

FROM node:${NODE_VERSION} AS dependencies

WORKDIR /app

COPY package.json package-lock.json* yarn.lock* pnpm-lock.yaml* .npmrc* ./

RUN if [ -f package-lock.json ]; then \
    npm ci --no-audit --no-fund; \
  elif [ -f yarn.lock ]; then \
    corepack enable && yarn install --frozen-lockfile --production=false; \
  elif [ -f pnpm-lock.yaml ]; then \
    corepack enable && pnpm install --frozen-lockfile; \
  else \
    npm install; \
  fi

# ============================================
# Stage 2: Build NestJS + generate Prisma client
# ============================================

FROM node:${NODE_VERSION} AS builder

WORKDIR /app

RUN apt-get update -y && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

COPY --from=dependencies /app/node_modules ./node_modules
COPY . .

ENV NODE_ENV=production

RUN npx prisma generate
RUN npm run build

# ============================================
# Stage 3: Run the compiled Nest app
# ============================================

FROM node:${NODE_VERSION} AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4000

# Prisma's query engine needs libssl to be present and detectable at runtime.
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/dist ./dist
COPY --from=builder --chown=node:node /app/prisma ./prisma
COPY --from=builder --chown=node:node /app/package.json ./package.json

USER node

EXPOSE 4000

# Applies any pending migrations before the API starts, so a fresh DB is
# initialized automatically on first boot (docker-compose owns a dedicated,
# empty Postgres instance for this service).
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
