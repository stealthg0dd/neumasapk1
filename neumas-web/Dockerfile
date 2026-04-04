# =============================================================================
# Neumas Web — Dockerfile
# Node 20 Alpine, multi-stage, standalone Next.js output
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1: deps — install production node_modules only
# -----------------------------------------------------------------------------
FROM node:20-alpine AS deps

# libc6-compat is needed for some native Node.js bindings on Alpine
RUN apk add --no-cache libc6-compat

WORKDIR /app

# Copy manifests and install *production* deps
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev --legacy-peer-deps

# -----------------------------------------------------------------------------
# Stage 2: builder — full install + next build
# -----------------------------------------------------------------------------
FROM node:20-alpine AS builder

RUN apk add --no-cache libc6-compat

WORKDIR /app

# Copy manifests and full install (includes devDeps needed for the build)
COPY package.json package-lock.json* ./
RUN npm ci --legacy-peer-deps

# Copy application source
COPY . .

# Disable Next.js telemetry during build
ENV NEXT_TELEMETRY_DISABLED=1

# Build — produces .next/standalone and .next/static
RUN npm run build

# -----------------------------------------------------------------------------
# Stage 3: runner — minimal image with standalone output
# -----------------------------------------------------------------------------
FROM node:20-alpine AS runner

RUN apk add --no-cache libc6-compat wget

WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME="0.0.0.0"

# Create a non-root user and group
RUN addgroup --system --gid 1001 nodejs && \
    adduser  --system --uid  1001 nextjs

# Copy the standalone server bundle
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./

# Copy static assets (not included in standalone)
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Copy public directory
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

USER nextjs

EXPOSE 3000

# Health check — polls /api/health every 30 s
HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

# Start the standalone Next.js server
CMD ["node", "server.js"]
