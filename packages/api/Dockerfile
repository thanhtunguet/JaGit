FROM node:22-alpine AS base
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

# Install dependencies
FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/api/package.json ./packages/api/
COPY packages/worker/package.json ./packages/worker/
COPY packages/dashboard/package.json ./packages/dashboard/
RUN pnpm install --frozen-lockfile

# Build
FROM deps AS builder
COPY . .
RUN pnpm --filter @jigit/shared build
RUN pnpm --filter @jigit/dashboard build
RUN pnpm --filter @jigit/api build

# Runtime
FROM base AS runner
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=builder /app/packages/shared/prisma ./packages/shared/prisma
COPY --from=builder /app/packages/api/dist ./packages/api/dist
COPY --from=builder /app/packages/api/node_modules ./packages/api/node_modules
COPY --from=builder /app/packages/dashboard/dist ./packages/dashboard/dist

EXPOSE 3000
CMD ["node", "packages/api/dist/main.js"]
