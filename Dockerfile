# ==============================================================================
# Production Dockerfile for @ipl-auction/backend (Monorepo Isolated Build)
# Compatible with Render, Railway, Fly.io, and Docker Swarm/K8s
# ==============================================================================

# ------------------------------------------------------------------------------
# Stage 1: Base Environment with pnpm
# ------------------------------------------------------------------------------
FROM node:22-alpine AS base
ENV NPM_CONFIG_IGNORED_BUILD_SCRIPTS=false
ENV PNPM_CONFIG_IGNORED_BUILD_SCRIPTS=false
RUN corepack enable && corepack prepare pnpm@11.5.2 --activate
WORKDIR /app

# ------------------------------------------------------------------------------
# Stage 2: Dependencies & Source Assembly
# ------------------------------------------------------------------------------
FROM base AS builder
RUN apk add --no-cache libc6-compat

# Copy root manifest, workspace configuration, and npmrc
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json .npmrc ./

# Copy packages and backend application source
COPY packages/ ./packages/
COPY apps/backend/ ./apps/backend/

# Install dependencies (including devDependencies required for tsc compilation)
RUN pnpm install --frozen-lockfile

# Compile TypeScript to JavaScript for shared package and backend
RUN pnpm --filter @ipl-auction/shared run build && pnpm --filter @ipl-auction/backend run build

# ------------------------------------------------------------------------------
# Stage 3: Lean Production Runner
# ------------------------------------------------------------------------------
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3001
ENV NPM_CONFIG_IGNORED_BUILD_SCRIPTS=false
ENV PNPM_CONFIG_IGNORED_BUILD_SCRIPTS=false

RUN corepack enable && corepack prepare pnpm@11.5.2 --activate

# Security: Non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 backenduser

# Copy workspace configuration and pre-built artifacts
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json .npmrc ./
COPY packages/ ./packages/
COPY apps/backend/package.json ./apps/backend/package.json
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/apps/backend/dist ./apps/backend/dist

# Install production dependencies only to keep container image minimal (< 160MB)
RUN pnpm install --prod --frozen-lockfile

USER backenduser

EXPOSE 3001

CMD ["node", "apps/backend/dist/server.js"]
